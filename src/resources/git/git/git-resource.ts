import { ExampleConfig, Resource, ResourceSettings, SpawnStatus, Utils, getPty, z } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';

import { GitEmailParameter } from './git-email-paramater.js';
import { GitNameParameter } from './git-name-parameter.js';
import { requiresOnMacOS } from '../../../utils/requires.js';

export const schema = z.object({
  email: z.string().optional().describe('The global email to set for git'),
  username: z.string().optional().describe('The global username to set for git'),
})
  .describe('Set and manage global git settings (email and username)');

export type GitConfig = z.infer<typeof schema>;

const exampleConfig: ExampleConfig = {
  title: 'Configure global git identity',
  description: 'Set the global git username and email used for all commits on this machine.',
  configs: [{
    type: 'git',
    email: 'you@example.com',
    username: 'Your Name',
  }]
}

export class GitResource extends Resource<GitConfig> {
  getSettings(): ResourceSettings<GitConfig> {
    return {
      id: 'git',
      requires: requiresOnMacOS('xcode-tools'),
      exampleConfigs: {
        example1: exampleConfig,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      removeStatefulParametersBeforeDestroy: true,
      parameterSettings: {
        email: { stateful: new GitEmailParameter(), },
        username: { stateful: new GitNameParameter() },
      },
    }
  }

  async refresh(): Promise<Partial<GitConfig> | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which git')
    return status === SpawnStatus.ERROR ? null : {}
  }

  async create(): Promise<void> {
    await Utils.installViaPkgMgr('git');
  }

  async destroy(): Promise<void> {
    await Utils.uninstallViaPkgMgr('git');
  }
}
