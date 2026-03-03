import { Resource, ResourceSettings, SpawnStatus, Utils, getPty } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from 'codify-schemas';

import { GitEmailParameter } from './git-email-paramater.js';
import { GitNameParameter } from './git-name-parameter.js';
import Schema from './git-schema.json';

export interface GitConfig extends StringIndexedObject {
  email?: string,
  username?: string,
  // TODO: Allow upgrading git to the latest version in the future. This means installing git using homebrew
}

export class GitResource extends Resource<GitConfig> {
  getSettings(): ResourceSettings<GitConfig> {
    return {
      id: 'git',
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
