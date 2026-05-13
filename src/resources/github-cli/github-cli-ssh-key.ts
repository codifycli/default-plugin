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
import os from 'node:os';
import path from 'node:path';

import { exampleGithubCliSshKeyBasic, exampleGithubCliSshKeyFull } from './examples.js';

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
  type: string;
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
      dependencies: ['github-cli'],
      parameterSettings: {
        title: {},
        keyFile: {},
        keyType: {},
      },
      allowMultiple: {
        identifyingParameters: ['title'],
        findAllParameters: async () => {
          const $ = getPty();
          const { data, status } = await $.spawnSafe(
            'gh ssh-key list --json id,title,type'
          );
          if (status === SpawnStatus.ERROR || !data.trim()) return [];

          try {
            const keys: GithubSshKey[] = JSON.parse(data);
            return keys.map((k) => ({ title: k.title }));
          } catch {
            return [];
          }
        },
      },
    };
  }

  async refresh(params: Partial<GithubCliSshKeyConfig>): Promise<Partial<GithubCliSshKeyConfig> | null> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe('gh ssh-key list --json id,title,type');
    if (status === SpawnStatus.ERROR) return null;

    let keys: GithubSshKey[];
    try {
      keys = JSON.parse(data);
    } catch {
      return null;
    }

    const found = keys.find((k) => k.title === params.title);
    if (!found) return null;

    return {
      title: found.title,
      keyFile: params.keyFile,
      keyType: found.type as 'authentication' | 'signing',
    };
  }

  async create(plan: CreatePlan<GithubCliSshKeyConfig>): Promise<void> {
    const $ = getPty();
    const { title, keyFile, keyType } = plan.desiredConfig;

    const resolvedKeyFile = keyFile.replace(/^~/, os.homedir());
    const typeFlag = keyType ? ` --type ${keyType}` : '';

    await $.spawn(
      `gh ssh-key add "${resolvedKeyFile}" --title "${title}"${typeFlag}`
    );
  }

  async destroy(plan: DestroyPlan<GithubCliSshKeyConfig>): Promise<void> {
    const $ = getPty();
    const { title } = plan.currentConfig;

    const { data, status } = await $.spawnSafe('gh ssh-key list --json id,title,type');
    if (status === SpawnStatus.ERROR || !data.trim()) return;

    let keys: GithubSshKey[];
    try {
      keys = JSON.parse(data);
    } catch {
      return;
    }

    const found = keys.find((k) => k.title === title);
    if (!found) return;

    await $.spawn(`gh ssh-key delete ${found.id} --yes`);
  }
}
