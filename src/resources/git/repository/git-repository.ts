import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  getPty
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import { exampleSshConfigs } from '../../ssh/examples.js';
import Schema from './git-repository-schema.json';

export interface GitRepositoryConfig extends ResourceConfig {
  autoVerifySSH: boolean;
  directory?: string;
  parentDirectory?: string;
  repository: string;
}

const defaultConfig: Partial<GitRepositoryConfig> = {
  repository: '<Replace me here!>',
  directory: '<Replace me here!>',
}

const exampleDirectory: ExampleConfig = {
  title: 'Clone a repository into a specific directory',
  description: 'Clone a single Git repository and specify the exact destination path.',
  configs: [{
    type: 'git-repository',
    repository: 'git@github.com:org/repo.git',
    directory: '~/projects/repo',
  }]
}


export class GitRepositoryResource extends Resource<GitRepositoryConfig> {
  getSettings(): ResourceSettings<GitRepositoryConfig> {
    return {
      id: 'git-repository',
      defaultConfig,
      exampleConfigs: {
        example1: exampleDirectory,
        ...exampleSshConfigs,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        directory: { type: 'directory' },
        parentDirectory: { type: 'directory' },
        autoVerifySSH: { type: 'boolean', default: true, setting: true },
      },
      importAndDestroy: {
        preventImport: true,
      },
      allowMultiple: {
        matcher: (desired, current) => {
          const desiredPath = desired.parentDirectory
            ? path.resolve(desired.parentDirectory, this.extractBasename(desired.repository!)!)
            : path.resolve(desired.directory!);

          const currentPath = current.parentDirectory
            ? path.resolve(current.parentDirectory, this.extractBasename(current.repository!)!)
            : path.resolve(current.directory!);

          if (process.platform === 'darwin') {
            return desiredPath.toLowerCase() === currentPath.toLowerCase();
          }

          return desiredPath === currentPath;
        },
        async findAllParameters() {
          const $ = getPty();
          const { data } = await $.spawnSafe('find ~ -type d \\( -path $HOME/Library -o -path $HOME/Pictures -o -path $HOME/Utilities -o -path "$HOME/.*" \\) -prune -o -name .git -print')

          return data
            ?.split(/\n/)?.filter(Boolean)
            ?.map((p) => path.dirname(p))
            ?.map((directory) => ({ directory }))
            ?? [];
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

  override async refresh(parameters: Partial<GitRepositoryConfig>): Promise<Partial<GitRepositoryConfig> | null> {
    const $ = getPty();

    if (parameters.parentDirectory) {
      const repoDir = path.resolve(parameters.parentDirectory, this.extractBasename(parameters.repository!)!);
      const exists = await FileUtils.checkDirExistsOrThrowIfFile(repoDir);
      if (!exists) {
        return null;
      }

      const { data: url } = await $.spawn('git config --get remote.origin.url', { cwd: repoDir });
      return {
        parentDirectory: parameters.parentDirectory,
        repository: url.trim(),
        autoVerifySSH: parameters.autoVerifySSH,
      }
    }

    const exists = await FileUtils.checkDirExistsOrThrowIfFile(parameters.directory!);
    if (!exists) {
      return null;
    }

    const { data: url } = await $.spawn('git config --get remote.origin.url', { cwd: parameters.directory });
    return {
      directory: parameters.directory,
      repository: url.trim(),
      autoVerifySSH: parameters.autoVerifySSH,
    }
  }

  override async create(plan: CreatePlan<GitRepositoryConfig>): Promise<void> {
    const $ = getPty();
    const { directory, parentDirectory, repository, autoVerifySSH } = plan.desiredConfig;

    if (autoVerifySSH) {
      await this.autoVerifySSHForFirstAttempt(repository);
    }

    if (parentDirectory) {
      const resolvedParent = path.resolve(parentDirectory);
      await FileUtils.createDirIfNotExists(resolvedParent);
      await $.spawn(`git clone ${repository}`, { cwd: resolvedParent });
    } else {
      await $.spawn(`git clone ${repository} ${path.resolve(directory!)}`);
    }
  }

  override async destroy(plan: DestroyPlan<GitRepositoryConfig>): Promise<void> {
    const { directory, parentDirectory, repository } = plan.currentConfig;
    const target = parentDirectory
      ? path.resolve(parentDirectory, this.extractBasename(repository)!)
      : directory;
    throw new Error(`The git-repository resource is not designed to delete folders.\nPlease delete ${target} manually and re-apply`);
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
