import { ExampleConfig, Resource, ResourceSettings, SpawnStatus, Utils, getPty, z } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';

import { GitEmailParameter } from './git-email-paramater.js';
import { GitNameParameter } from './git-name-parameter.js';
import { requiresOnMacOS } from '../../../utils/requires.js';

export const schema = z.object({
  email: z.string().optional().describe('The global email to set for git'),
  username: z.string().optional().describe('The global username to set for git'),
})
  .describe('Configures global git settings: the user name and email used for commits (git config --global user.name and user.email).');

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
    return await isGitInstalled() ? {} : null;
  }

  async create(): Promise<void> {
    // On macOS git comes with the Xcode Command Line Tools (required, so applied first)
    if (await isGitInstalled({ interactive: true })) {
      return;
    }

    await Utils.installViaPkgMgr('git');
  }

  async destroy(): Promise<void> {
    if (Utils.isMacOS() && await gitPath({ interactive: true }) === MACOS_SYSTEM_GIT) {
      console.warn('git is part of the Xcode Command Line Tools on macOS and cannot be uninstalled separately. Skipping...');
      return;
    }

    await Utils.uninstallViaPkgMgr('git');
  }
}

const MACOS_SYSTEM_GIT = '/usr/bin/git';

async function gitPath(options?: { interactive?: boolean }): Promise<null | string> {
  const { data, status } = await getPty().spawnSafe('which git', options);
  return status === SpawnStatus.ERROR || !data.trim() ? null : data.trim();
}

/**
 * On a fresh Mac /usr/bin/git is a stub that opens an "install developer tools" dialog, so `which git` alone is not
 * enough: the system git only works once the Xcode Command Line Tools (or Xcode) are installed.
 */
async function isGitInstalled(options?: { interactive?: boolean }): Promise<boolean> {
  const path = await gitPath(options);
  if (!path) {
    return false;
  }

  if (Utils.isMacOS() && path === MACOS_SYSTEM_GIT) {
    const { status } = await getPty().spawnSafe('xcode-select -p', options);
    return status === SpawnStatus.SUCCESS;
  }

  return true;
}
