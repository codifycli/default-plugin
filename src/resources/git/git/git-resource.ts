import { ExampleConfig, Resource, ResourceSettings, SpawnStatus, Utils, getPty } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';

import { GitEmailParameter } from './git-email-paramater.js';
import { GitNameParameter } from './git-name-parameter.js';
import Schema from './git-schema.json';

export interface GitConfig extends StringIndexedObject {
  email?: string,
  username?: string,
  // TODO: Allow upgrading git to the latest version in the future. This means installing git using homebrew
}

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
      exampleConfigs: {
        example1: exampleConfig,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      removeStatefulParametersBeforeDestroy: true,
      parameterSettings: {
        email: { type: 'stateful', definition: new GitEmailParameter(), },
        username: { type: 'stateful', definition: new GitNameParameter() },
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
