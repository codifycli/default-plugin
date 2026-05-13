import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  getPty
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import { exampleSshConfigs } from '../../ssh/examples.js';
import Schema from './git-repositories-schema.json';

export interface GitRepositoriesConfig extends ResourceConfig {
  autoVerifySSH: boolean;
  parentDirectory: string;
  repositories: string[];
}

const defaultConfig: Partial<GitRepositoriesConfig> = {
  parentDirectory: '<Replace me here!>',
  repositories: [],
}

const exampleBasic: ExampleConfig = {
  title: 'Clone multiple repositories',
  description: 'Clone a set of Git repositories into a shared parent directory.',
  configs: [{
    type: 'git-repositories',
    parentDirectory: '~/projects',
    repositories: [
      'git@github.com:org/repo-a.git',
      'git@github.com:org/repo-b.git',
    ],
  }]
}


export class GitRepositoriesResource extends Resource<GitRepositoriesConfig> {
  getSettings(): ResourceSettings<GitRepositoriesConfig> {
    return {
      id: 'git-repositories',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        ...exampleSshConfigs,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        repositories: { type: 'array', canModify: true },
        parentDirectory: { type: 'directory' },
        autoVerifySSH: { type: 'boolean', default: true, setting: true },
      },
      importAndDestroy: {
        requiredParameters: ['parentDirectory']
      },
      allowMultiple: {
        matcher: (desired, current) => {
          const desiredPath = path.resolve(desired.parentDirectory!);
          const currentPath = path.resolve(current.parentDirectory!);

          if (process.platform === 'darwin') {
            return desiredPath.toLowerCase() === currentPath.toLowerCase();
          }

          return desiredPath === currentPath;
        },
        async findAllParameters() {
          const $ = getPty();
          const { data } = await $.spawnSafe('find ~ -type d \\( -path $HOME/Library -o -path $HOME/Pictures -o -path $HOME/Utilities -o -path "$HOME/.*" \\) -prune -o -name .git -print')

          const directories = data
              ?.split(/\n/)?.filter(Boolean)
              ?.map((p) => path.dirname(p))
              ?.map((directory) => ({ directory }))
            ?? [];

          const groupedDirectories = Object.groupBy(directories, (d) => path.dirname(d.directory));
          return Object.entries(groupedDirectories)
            .filter(([_, dirs]) => (dirs?.length ?? 0) > 1)
            .map(([parent]) => ({ parentDirectory: parent }));
        }
      },
      dependencies: [
        'ssh-key',
        'ssh-add',
        'ssh-config',
        'wait-github-ssh-key'
      ]
    }
  }

  override async refresh(parameters: Partial<GitRepositoriesConfig>): Promise<Partial<GitRepositoriesConfig> | null> {
    const $ = getPty();

    const parentExists = await FileUtils.checkDirExistsOrThrowIfFile(parameters.parentDirectory!);
    if (!parentExists) {
      return null;
    }

    const { data } = await $.spawnSafe(`find "${parameters.parentDirectory}" -maxdepth 2 -type d -name .git`, { cwd: parameters.parentDirectory });

    const gitDirs = data?.split(/\n/)?.filter(Boolean) ?? [];
    if (gitDirs.length === 0) {
      return null;
    }

    const repositories: string[] = [];
    for (const gitDir of gitDirs) {
      const repoPath = path.dirname(gitDir);
      const { data: url } = await $.spawnSafe('git config --get remote.origin.url', { cwd: repoPath });
      if (url && url.trim()) {
        repositories.push(url.trim());
      }
    }

    if (repositories.length === 0) {
      return null;
    }

    return {
      parentDirectory: parameters.parentDirectory,
      repositories,
      autoVerifySSH: parameters.autoVerifySSH,
    }
  }

  override async create(plan: CreatePlan<GitRepositoriesConfig>): Promise<void> {
    const $ = getPty();
    const { parentDirectory, repositories, autoVerifySSH } = plan.desiredConfig;
    const resolvedParent = path.resolve(parentDirectory);

    await FileUtils.createDirIfNotExists(resolvedParent);

    for (const repository of repositories) {
      if (autoVerifySSH) {
        await this.autoVerifySSHForFirstAttempt(repository);
      }
      await $.spawn(`git clone ${repository}`, { cwd: resolvedParent });
    }
  }

  override async destroy(plan: DestroyPlan<GitRepositoriesConfig>): Promise<void> {
    const paths = plan.currentConfig.repositories
      ?.map((r) => path.resolve(plan.currentConfig.parentDirectory, this.extractBasename(r)!))
      .join(', ');
    throw new Error(`The git-repositories resource is not designed to delete folders.\nPlease delete ${paths} manually and re-apply`);
  }

  async modify(pc: ParameterChange<GitRepositoriesConfig>, plan: ModifyPlan<GitRepositoriesConfig>): Promise<void> {
    if (pc.name !== 'repositories') {
      return;
    }

    const $ = getPty();
    const currentRepos = plan.currentConfig.repositories ?? [];
    const desiredRepos = plan.desiredConfig.repositories ?? [];

    const reposToAdd = desiredRepos.filter((repo) => !currentRepos.includes(repo));
    const reposToRemove = currentRepos.filter((repo) => !desiredRepos.includes(repo));

    if (reposToRemove.length > 0 && plan.isStateful) {
      const removedPaths = reposToRemove
        .map((r) => path.resolve(plan.currentConfig.parentDirectory, this.extractBasename(r)!))
        .join(', ');
      throw new Error(`The git-repositories resource is not designed to delete folders.\nPlease delete ${removedPaths} manually and re-apply`);
    }

    if (reposToAdd.length > 0) {
      const resolvedParent = path.resolve(plan.desiredConfig.parentDirectory);
      await FileUtils.createDirIfNotExists(resolvedParent);

      for (const repository of reposToAdd) {
        if (plan.desiredConfig.autoVerifySSH) {
          await this.autoVerifySSHForFirstAttempt(repository);
        }
        await $.spawn(`git clone ${repository}`, { cwd: resolvedParent });
      }
    }
  }

  // Converts https://github.com/kevinwang5658/codify-homebrew-plugin.git => codify-homebrew-plugin
  private extractBasename(name: string): string | undefined {
    return name
      .split('/')
      .at(-1)
      ?.replace('.git', '')
      ?.replace('/', '')
      ?.trim();
  }

  private async autoVerifySSHForFirstAttempt(url: string): Promise<void> {
    const $ = getPty();

    if (!(url.includes('@') || url.includes('ssh://'))) {
      return;
    }

    const baseUrlRegex = /(git)?@(?<url>[\w.]+)(:?(\/\/)?)([\w./:@~-]+)(\.git)(\/)?/gm
    const groups = baseUrlRegex.exec(url)?.groups
    if (!groups?.url) {
      console.log(`Un-able to extract base url from ssh ${url}. Skipping auto verification...`)
      return;
    }

    await $.spawnSafe('touch ~/.ssh/known_hosts')

    const baseUrl = groups!.url!
    const { data: existingKey } = await $.spawnSafe(`ssh-keygen -F ${baseUrl}`)

    if (!this.isBlank(existingKey)) {
      return;
    }

    await $.spawn(`ssh-keyscan ${baseUrl} >> ~/.ssh/known_hosts `)
  }

  isBlank(str: string): boolean {
    return (!str || /^\s*$/.test(str));
  }
}
