import { CreatePlan, DestroyPlan, Resource, ResourceSettings, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import Schema from './git-repository-schema.json';

export interface GitRepositoryConfig extends ResourceConfig {
  autoVerifySSH: boolean
  directory?: string,
  parentDirectory?: string,
  repositories?: string[],
  repository: string,
}

export class GitRepositoryResource extends Resource<GitRepositoryConfig> {
  getSettings(): ResourceSettings<GitRepositoryConfig> {
    return {
      id: 'git-repository',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        repositories: { type: 'array' },
        parentDirectory: { type: 'directory' },
        directory: { type: 'directory' },
        autoVerifySSH: { type: 'boolean', default: true, setting: true },
      },
      importAndDestroy: {
        requiredParameters: ['directory']
      },
      allowMultiple: {
        matcher: (desired, current) => {
          const desiredPath = desired.parentDirectory
            ? desired.repositories?.map((r) => path.resolve(desired.parentDirectory!, this.extractBasename(r)!))
            : path.resolve(desired.directory!);

          const currentPath = current.parentDirectory
            ? current.repositories?.map((r) => path.resolve(current.parentDirectory!, this.extractBasename(r)!))
            : path.resolve(current.directory!);

          const isNotCaseSensitive = process.platform === 'darwin';
          if (isNotCaseSensitive) {
            if (!Array.isArray(desiredPath) && !Array.isArray(currentPath)) {
              return desiredPath!.toLowerCase() === currentPath!.toLowerCase()
            }

            if (Array.isArray(desiredPath) && Array.isArray(currentPath)) {
              const currentLowered = new Set(currentPath.map((c) => c.toLowerCase()))
              return desiredPath.some((d) => currentLowered.has(d.toLowerCase()))
            }
          }

          if (Array.isArray(desiredPath) && Array.isArray(currentPath)) {
            return desiredPath.some((d) => currentPath.includes(d))
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
          const multipleRepositories = Object.entries(groupedDirectories).filter(([_, dirs]) => (dirs?.length ?? 0) > 1)
            .map(([parent]) => ({ parentDirectory: parent }))
          const singleRepositories = Object.entries(groupedDirectories).filter(([_, dirs]) => (dirs?.length ?? 0) === 1)
            .map(([directory]) => ({ directory }))

          return [...multipleRepositories, ...singleRepositories];
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
      // Check if parent directory exists
      const parentExists = await FileUtils.checkDirExistsOrThrowIfFile(parameters.parentDirectory);
      if (!parentExists) {
        return null;
      }

      // Find all git repositories in the parent directory
      const { data } = await $.spawnSafe(`find "${parameters.parentDirectory}" -maxdepth 2 -type d -name .git`, { cwd: parameters.parentDirectory });

      const gitDirs = data?.split(/\n/)?.filter(Boolean) ?? [];
      if (gitDirs.length === 0) {
        return null;
      }

      // Get repository URLs for all found git directories
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

    if (parameters.directory) {
      const exists = await FileUtils.checkDirExistsOrThrowIfFile(parameters.directory);
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

    throw new Error('Either directory or parent directory must be supplied');
  }


  override async create(plan: CreatePlan<GitRepositoryConfig>): Promise<void> {
    const $ = getPty();
    const config = plan.desiredConfig;

    if (config.parentDirectory) {
      const parentDirectory = path.resolve(config.parentDirectory);
      await FileUtils.createDirIfNotExists(parentDirectory);

      // Clone all repositories in the list
      const repositories = (config as any).repositories || [config.repository];
      for (const repository of repositories) {
        if (plan.desiredConfig.autoVerifySSH) {
          await this.autoVerifySSHForFirstAttempt(repository);
        }

        await $.spawn(`git clone ${repository}`, { cwd: parentDirectory });
      }
    } else {
      const directory = path.resolve(config.directory!);
      await $.spawn(`git clone ${config.repository} ${directory}`);
    }
  }

  override async destroy(plan: DestroyPlan<GitRepositoryConfig>): Promise<void> {
    // Do nothing here. We don't want to destroy a user's repository.
    // TODO: change this to skip the destroy only if the user's repo has pending changes (check via git)
    throw new Error(`The git-clone resource is not designed to delete folders.
Please delete ${plan.currentConfig.directory ?? (plan.currentConfig.repositories?.map((r) => path.resolve(plan.currentConfig.parentDirectory!, this.extractBasename(r)!)).join(', '))} manually and re-apply`);
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
      // Not an ssh url
      return;
    }

    const baseUrlRegex = /(git)?@(?<url>[\w.]+)(:?(\/\/)?)([\w./:@~-]+)(\.git)(\/)?/gm
    const groups = baseUrlRegex.exec(url)?.groups
    if (!groups?.url) {
      // Was unable to extract base url
      console.log(`Un-able to extract base url from ssh ${url}. Skipping auto verification...`)
      return;
    }

    // Create known hosts file it doesn't exist
    await $.spawnSafe('touch ~/.ssh/known_hosts')

    const baseUrl = groups!.url!
    const { data: existingKey } = await $.spawnSafe(`ssh-keygen -F ${baseUrl}`)

    if (!this.isBlank(existingKey)) {
      // An existing key is already in the file. Skipping..
      return;
    }

    // TODO: Add fingerprint verification here
    await $.spawn(`ssh-keyscan ${baseUrl} >> ~/.ssh/known_hosts `)
  }

  isBlank(str: string): boolean {
    return (!str || /^\s*$/.test(str));
  }
}
