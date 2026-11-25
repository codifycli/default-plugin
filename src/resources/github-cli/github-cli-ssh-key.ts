import {
  CreatePlan,
  DestroyPlan,
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

import { exampleGithubCliSshKeyBasic, exampleGithubCliSshKeyFull } from './examples.js';
import { ensureTokenScopes, stripAnsi } from './gh-scopes.js';

export const schema = z
  .object({
    title: z
      .string()
      .describe('Display name for the SSH key on GitHub'),
    keyFile: z
      .string()
      .describe('Path to the local SSH public key file to upload (e.g. ~/.ssh/id_ed25519.pub)'),
    keyType: z
      .enum(['authentication', 'signing'])
      .optional()
      .describe('Key usage type: "authentication" for git operations (default) or "signing" for commit signing'),
  })
  .meta({ $comment: 'https://cli.github.com/manual/gh_ssh-key' })
  .describe('GitHub account SSH key — upload a local SSH public key to your GitHub account');

export type GithubCliSshKeyConfig = z.infer<typeof schema>;

interface GithubSshKey {
  id: number;
  title: string;
  key: string;
}

const GITHUB_HOSTNAME = 'github.com';

const KEY_TYPE_API = {
  authentication: { endpoint: 'user/keys', scope: 'admin:public_key' },
  signing: { endpoint: 'user/ssh_signing_keys', scope: 'admin:ssh_signing_key' },
} as const;

/** Parses the output of `gh api --paginate <keys endpoint> --jq '.[] | @json'` (one JSON object per line). */
export function parseGithubSshKeys(output: string): GithubSshKey[] {
  return stripAnsi(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as GithubSshKey);
}

/** The "<algorithm> <base64>" part of a public key, which is how GitHub returns keys (without the comment). */
export function publicKeyIdentity(publicKey: string): string | null {
  const [algorithm, data] = publicKey.trim().split(/\s+/);
  return algorithm && data ? `${algorithm} ${data}` : null;
}

/** The keys of this type on the GitHub account, or null if they can't be listed (not logged in, missing scope). */
async function listGithubSshKeys(
  keyType: 'authentication' | 'signing',
  interactive = false,
): Promise<GithubSshKey[] | null> {
  const $ = getPty();
  const { data, status } = await $.spawnSafe(
    `gh api --paginate "${KEY_TYPE_API[keyType].endpoint}" --jq '.[] | @json'`,
    { interactive },
  );
  if (status === SpawnStatus.ERROR) return null;

  try {
    return parseGithubSshKeys(data);
  } catch {
    return null;
  }
}

const defaultConfig: Partial<GithubCliSshKeyConfig> = {
  keyType: 'authentication',
};

export class GithubCliSshKeyResource extends Resource<GithubCliSshKeyConfig> {
  getSettings(): ResourceSettings<GithubCliSshKeyConfig> {
    return {
      id: 'github-cli-ssh-key',
      defaultConfig,
      exampleConfigs: {
        example1: exampleGithubCliSshKeyBasic,
        example2: exampleGithubCliSshKeyFull,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      // The key and the gh login must exist before the key can be uploaded.
      dependencies: ['github-cli', 'github-cli-auth', 'ssh-key'],
      parameterSettings: {
        title: {},
        keyFile: {},
        keyType: {},
      },
      allowMultiple: {
        identifyingParameters: ['title'],
        findAllParameters: async () => {
          const keys = await listGithubSshKeys('authentication');
          return (keys ?? []).map((k) => ({ title: k.title }));
        },
      },
    };
  }

  async refresh(params: Partial<GithubCliSshKeyConfig>): Promise<Partial<GithubCliSshKeyConfig> | null> {
    const keyType = params.keyType ?? 'authentication';
    const keys = await listGithubSshKeys(keyType);
    if (!keys) return null;

    // Match on the key itself first so a key uploaded under another title (ex: by gh auth login) counts as uploaded.
    const localKey = await this.readLocalKey(params.keyFile);
    const found = (localKey && keys.find((k) => publicKeyIdentity(k.key) === localKey))
      ?? keys.find((k) => k.title === params.title);
    if (!found) return null;

    return {
      title: params.title,
      keyFile: params.keyFile,
      keyType,
    };
  }

  async create(plan: CreatePlan<GithubCliSshKeyConfig>): Promise<void> {
    const $ = getPty();
    const { title, keyFile, keyType = 'authentication' } = plan.desiredConfig;

    // Uploading needs a scope that gh auth login doesn't request by default.
    await ensureTokenScopes(GITHUB_HOSTNAME, [KEY_TYPE_API[keyType].scope]);

    const { data, status } = await $.spawnSafe(
      `gh ssh-key add "${this.resolveKeyFile(keyFile)}" --title "${title}" --type ${keyType}`,
      { interactive: true },
    );

    if (status === SpawnStatus.ERROR && !/already (exists|in use)/i.test(data)) {
      throw new Error(`Failed to upload SSH key ${keyFile} to GitHub: ${data}`);
    }
  }

  async destroy(plan: DestroyPlan<GithubCliSshKeyConfig>): Promise<void> {
    const $ = getPty();
    const { title, keyFile, keyType = 'authentication' } = plan.currentConfig;
    const api = KEY_TYPE_API[keyType];

    await ensureTokenScopes(GITHUB_HOSTNAME, [api.scope]);

    const keys = await listGithubSshKeys(keyType, true);
    if (!keys) return;

    const localKey = await this.readLocalKey(keyFile);
    const found = (localKey && keys.find((k) => publicKeyIdentity(k.key) === localKey))
      ?? keys.find((k) => k.title === title);
    if (!found) return;

    await $.spawn(`gh api --method DELETE "${api.endpoint}/${found.id}"`, { interactive: true });
  }

  private async readLocalKey(keyFile: string | undefined): Promise<string | null> {
    if (!keyFile) return null;

    try {
      return publicKeyIdentity(await fs.readFile(this.resolveKeyFile(keyFile), 'utf8'));
    } catch {
      return null;
    }
  }

  private resolveKeyFile(keyFile: string): string {
    return path.resolve(keyFile.replace(/^~/, os.homedir()));
  }
}
