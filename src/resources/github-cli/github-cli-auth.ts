import {
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
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
      dependencies: ['github-cli'],
      parameterSettings: {
        token: { canModify: true, isSensitive: true },
        hostname: { default: 'github.com' },
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

    const { data: tokenData, status: tokenStatus } = await $.spawnSafe(
      `gh auth token --hostname "${hostname}"`
    );
    if (tokenStatus === SpawnStatus.ERROR) return { hostname };

    return {
      hostname,
      token: tokenData.trim(),
    };
  }

  async create(plan: CreatePlan<GithubCliAuthConfig>): Promise<void> {
    const { token, hostname = 'github.com' } = plan.desiredConfig;
    await this.login(token, hostname);
  }

  async modify(
    _pc: unknown,
    plan: ModifyPlan<GithubCliAuthConfig>
  ): Promise<void> {
    const { token, hostname = 'github.com' } = plan.desiredConfig;
    await this.login(token, hostname);
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

  private async login(token: string | undefined, hostname: string): Promise<void> {
    const $ = getPty();

    if (!token) {
      await $.spawn(`gh auth login --hostname "${hostname}" --web`, { interactive: true, stdin: true });
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
