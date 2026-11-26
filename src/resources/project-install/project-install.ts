import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import path from 'node:path';

import { installDirectory, isDirectoryInSync } from './package-managers.js';
import { DEPENDENCIES, sharedInstallOptions } from './schema.js';
import { requiresOnMacOS } from '../../utils/requires.js';

export const schema = z.object({
  directory: z.string().describe('The project directory to install dependencies in.'),
  ...sharedInstallOptions,
})
  .describe('Installs a project\'s dependencies (npm install, pnpm install, uv sync, bundle install, ...). Only runs when the dependencies are out of date.');

export type ProjectInstallConfig = z.infer<typeof schema>;

const defaultConfig: Partial<ProjectInstallConfig> = {
  directory: '<Replace me here!>',
}

const exampleNode: ExampleConfig = {
  title: 'Install a Node.js project\'s dependencies',
  description: 'Run pnpm install with a frozen lockfile inside a project, only when the lockfile has changed or node_modules is missing.',
  configs: [{
    type: 'project-install',
    directory: '~/projects/web-app',
    packageManagers: ['pnpm'],
    frozenLockfile: true,
  }]
}

const exampleCloneAndInstall: ExampleConfig = {
  title: 'Clone a repository and install its dependencies',
  description: 'Install Node.js, clone a repository and install its dependencies with whichever package manager its lockfile uses.',
  configs: [
    { type: 'nvm', nodeVersions: ['22'], global: '22' },
    { type: 'git-repository', repository: 'git@github.com:org/web-app.git', directory: '~/projects/web-app' },
    { type: 'project-install', directory: '~/projects/web-app' },
  ]
}

export class ProjectInstallResource extends Resource<ProjectInstallConfig> {
  getSettings(): ResourceSettings<ProjectInstallConfig> {
    return {
      id: 'project-install',
      requires: requiresOnMacOS('xcode-tools'),
      defaultConfig,
      exampleConfigs: {
        example1: exampleNode,
        example2: exampleCloneAndInstall,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        directory: { type: 'directory' },
        packageManagers: { type: 'array', setting: true },
        frozenLockfile: { type: 'boolean', setting: true },
        args: { type: 'array', setting: true },
        env: { type: 'object', setting: true, isSensitive: true },
        virtualEnv: { type: 'string', setting: true },
      },
      importAndDestroy: {
        preventImport: true,
        preventDestroy: true,
      },
      allowMultiple: {
        matcher: (desired, current) =>
          samePath(desired.directory!, current.directory!)
          && sameManagers(desired.packageManagers, current.packageManagers),
      },
      dependencies: DEPENDENCIES,
    }
  }

  override async refresh(parameters: Partial<ProjectInstallConfig>): Promise<Partial<ProjectInstallConfig> | null> {
    const inSync = await isDirectoryInSync(parameters.directory!, parameters);
    return inSync ? parameters : null;
  }

  override async create(plan: CreatePlan<ProjectInstallConfig>): Promise<void> {
    const { directory, ...options } = plan.desiredConfig;
    await installDirectory(directory, options);
  }

  override async destroy(_plan: DestroyPlan<ProjectInstallConfig>): Promise<void> {}
}

export function samePath(a: string, b: string): boolean {
  const resolvedA = path.resolve(a);
  const resolvedB = path.resolve(b);
  return process.platform === 'darwin'
    ? resolvedA.toLowerCase() === resolvedB.toLowerCase()
    : resolvedA === resolvedB;
}

export function sameManagers(a?: string[], b?: string[]): boolean {
  return JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
}
