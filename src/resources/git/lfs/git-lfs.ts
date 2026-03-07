import { getPty, Resource, ResourceSettings, SpawnStatus, Utils } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import * as os from 'node:os';

import Schema from './git-lfs-schema.json';

export interface GitLfsConfig extends ResourceConfig {
  // TODO: Add --system option for installing.
}

export class GitLfsResource extends Resource<GitLfsConfig> {
  getSettings(): ResourceSettings<GitLfsConfig> {
    return {
      id: 'git-lfs',
      operatingSystems: [OS.Darwin],
      schema: Schema,
      dependencies: ['homebrew'],
    }
  }

  override async refresh(): Promise<Partial<GitLfsConfig> | null> {
    const $ = getPty();

    const result = await $.spawnSafe('git lfs');

    if (result.status === SpawnStatus.ERROR) {
      return null;
    }

    if (!await this.checkIfGitLfsIsInstalled()) {
      return null;
    }

    return {}
  }

  // FYI: This create might be called if git-lfs is installed but not initialized.
  override async create(): Promise<void> {
    const $ = getPty();
    await Utils.installViaPkgMgr('git-lfs');

    await $.spawn('git lfs install', { cwd: os.homedir(), interactive: true });
  }

  override async destroy(): Promise<void> {
    const $ = getPty();
    await $.spawn('git lfs uninstall', { cwd: os.homedir(), interactive: true });

    await Utils.uninstallViaPkgMgr('git-lfs');
  }

  private async checkIfGitLfsIsInstalled(): Promise<boolean> {
    const $ = getPty();

    const gitLfsStatus = await $.spawn('git lfs env', { cwd: os.homedir(), interactive: true, disableWrapping: true });
    const lines = gitLfsStatus.data.split('\n');

    // When git lfs exists but git lfs install hasn't been called then git lfs env returns:
    // git config filter.lfs.process = ""
    // git config filter.lfs.smudge = ""
    // git config filter.lfs.clean = ""
    const emptyLfsLines = lines.filter((l) => l.includes('git config filter.lfs'))
      .map((l) => l.split('=')[1].trim())
      .includes('""');

    return !emptyLfsLines;
  }
}
