import {
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { exampleGithubCliAuthBasic, exampleGithubCliAuthEnterprise } from './examples.js';
import { ensureTokenScopes, getTokenScopes, missingScopes } from './gh-scopes.js';

export const schema = z
  .object({
    token: z
      .string()
      .optional()
      .describe('GitHub personal access token (classic or fine-grained) used for authentication. Omit to use interactive browser-based login'),
    hostname: z
      .string()
      .optional()
      .describe('GitHub hostname (default: github.com). Set this for GitHub Enterprise Server instances'),
    scopes: z
      .array(z.string())
      .optional()
      .describe(
        'Additional OAuth scopes the login must have on top of gh\'s defaults (repo, read:org, gist), e.g. ["admin:public_key"] to upload SSH keys. ' +
        'Missing scopes are added with gh auth refresh, which asks you to approve them in the browser. Not checked for fine-grained tokens'
      ),
  })
  .meta({ $comment: 'https://cli.github.com/manual/gh_auth' })
  .describe('GitHub CLI authentication — log in and out of GitHub accounts');

export type GithubCliAuthConfig = z.infer<typeof schema>;

const defaultConfig: Partial<GithubCliAuthConfig> = {
  hostname: 'github.com',
  token: undefined,
};

export class GithubCliAuthResource extends Resource<GithubCliAuthConfig> {
  getSettings(): ResourceSettings<GithubCliAuthConfig> {
    return {
      id: 'github-cli-auth',
      defaultConfig,
      exampleConfigs: {
        example1: exampleGithubCliAuthBasic,
        example2: exampleGithubCliAuthEnterprise,
      },
      isSensitive: true,
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      // ssh-key first so the key exists before logging in (and before github-cli-ssh-key uploads it).
      dependencies: ['github-cli', 'ssh-key'],
      parameterSettings: {
        token: { canModify: true, isSensitive: true },
        hostname: { default: 'github.com' },
        scopes: { canModify: true },
      },
      importAndDestroy: {
        requiredParameters: [],
        defaultRefreshValues: {
          hostname: 'github.com',
        },
      },
      allowMultiple: {
        identifyingParameters: ['hostname'],
        findAllParameters: async () => {
          const $ = getPty();
          const { data, status } = await $.spawnSafe('gh auth status');
          if (status === SpawnStatus.ERROR || !data.trim()) return [];

          const hostnames: string[] = [];
          for (const line of data.split('\n')) {
            if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
              const hostname = line.trim();
              if (hostname) hostnames.push(hostname);
            }
          }
          return hostnames.map((h) => ({ hostname: h }));
        },
      },
    };
  }

  async refresh(params: Partial<GithubCliAuthConfig>): Promise<Partial<GithubCliAuthConfig> | null> {
    const $ = getPty();
    const hostname = params.hostname ?? 'github.com';

    const { status } = await $.spawnSafe(`gh auth status --hostname "${hostname}"`);
    if (status === SpawnStatus.ERROR) return null;

    const result: Partial<GithubCliAuthConfig> = { hostname };

    if (params.scopes) {
      result.scopes = await this.refreshScopes(hostname, params.scopes);
    }

    const { data: tokenData, status: tokenStatus } = await $.spawnSafe(
      `gh auth token --hostname "${hostname}"`
    );
    if (tokenStatus === SpawnStatus.ERROR) return result;

    return {
      ...result,
      token: tokenData.trim(),
    };
  }

  async create(plan: CreatePlan<GithubCliAuthConfig>): Promise<void> {
    const { token, hostname = 'github.com', scopes } = plan.desiredConfig;
    await this.login(token, hostname, scopes);
  }

  async modify(
    pc: ParameterChange<GithubCliAuthConfig>,
    plan: ModifyPlan<GithubCliAuthConfig>
  ): Promise<void> {
    const { token, hostname = 'github.com', scopes } = plan.desiredConfig;

    // Only the scopes changed: add the missing ones to the existing login instead of logging in again.
    if (pc.name === 'scopes') {
      await ensureTokenScopes(hostname, scopes ?? []);
      return;
    }

    await this.login(token, hostname, scopes);
  }

  async destroy(plan: DestroyPlan<GithubCliAuthConfig>): Promise<void> {
    const $ = getPty();
    const hostname = plan.currentConfig.hostname ?? 'github.com';

    const { data: statusData } = await $.spawnSafe(`gh auth status --hostname "${hostname}"`);
    const userMatch = statusData.match(/Logged in to \S+ account (\S+)/);
    const username = userMatch?.[1];

    if (username) {
      await $.spawnSafe(`gh auth logout --hostname "${hostname}" --user "${username}"`);
    } else {
      await $.spawnSafe(`gh auth logout --hostname "${hostname}"`);
    }
  }

  /**
   * The desired scopes the current login grants, in the desired order. The scopes gh can't report (fine-grained
   * tokens) are assumed granted since they can't be checked or added.
   */
  private async refreshScopes(hostname: string, desired: string[]): Promise<string[]> {
    const current = await getTokenScopes(hostname);
    if (current === null) {
      return desired;
    }

    const missing = new Set(missingScopes(current, desired));
    return desired.filter((scope) => !missing.has(scope));
  }

  private async login(token: string | undefined, hostname: string, scopes?: string[]): Promise<void> {
    const $ = getPty();

    if (!token) {
      const scopesFlag = scopes && scopes.length > 0 ? ` --scopes "${scopes.join(',')}"` : '';

      // Reuse the protocol set with the github-cli resource (gh config) so the login doesn't ask for it again.
      const { data: protocol, status: protocolStatus } = await $.spawnSafe('gh config get git_protocol', { interactive: true });
      const trimmedProtocol = protocol?.trim();
      const protocolFlag = protocolStatus === SpawnStatus.SUCCESS && (trimmedProtocol === 'ssh' || trimmedProtocol === 'https')
        ? ` --git-protocol ${trimmedProtocol}`
        : '';

      // --skip-ssh-key: with the ssh protocol gh offers to generate ~/.ssh/id_ed25519 and upload it. Keys are managed by
      // the ssh-key and github-cli-ssh-key resources instead, and a key generated here makes ssh-key ask to overwrite it.
      await $.spawn(
        `gh auth login --hostname "${hostname}" --web --skip-ssh-key${protocolFlag}${scopesFlag}`,
        { interactive: true, stdin: true },
      );
      return;
    }

    const tmpFile = path.join(os.tmpdir(), `.gh-token-${Date.now()}`);
    await fs.writeFile(tmpFile, token.trim(), { mode: 0o600 });
    try {
      await $.spawn(`gh auth login --with-token --hostname "${hostname}" < "${tmpFile}"`, {
        interactive: true,
      });
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  }
}
