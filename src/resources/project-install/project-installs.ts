import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { installDirectory, isDirectoryInSync } from './package-managers.js';
import { sameManagers, samePath } from './project-install.js';
import { DEPENDENCIES, sharedInstallOptions } from './schema.js';

export const schema = z.object({
  directories: z.array(z.string()).describe('The project directories to install dependencies in. Each directory is detected separately.'),
  ...sharedInstallOptions,
})
  .describe('Installs the dependencies of multiple projects that share the same install options. Only out-of-date projects are installed.');

export type ProjectInstallsConfig = z.infer<typeof schema>;

const defaultConfig: Partial<ProjectInstallsConfig> = {
  directories: [],
}

const exampleBasic: ExampleConfig = {
  title: 'Install dependencies for several projects',
  description: 'Install dependencies for a frontend, an API and a Python service, each with the package manager its lockfile uses.',
  configs: [{
    type: 'project-installs',
    directories: ['~/projects/web', '~/projects/api', '~/projects/ml-service'],
    frozenLockfile: true,
  }]
}

const exampleCloneAndInstall: ExampleConfig = {
  title: 'Clone repositories and install their dependencies',
  description: 'Install Node.js and uv, clone several repositories into ~/projects and install the dependencies of each one.',
  configs: [
    { type: 'nvm', nodeVersions: ['22'], global: '22' },
    { type: 'uv' },
    {
      type: 'git-repositories',
      parentDirectory: '~/projects',
      repositories: ['git@github.com:org/web.git', 'git@github.com:org/ml-service.git'],
    },
    { type: 'project-installs', directories: ['~/projects/web', '~/projects/ml-service'] },
  ]
}

export class ProjectInstallsResource extends Resource<ProjectInstallsConfig> {
  getSettings(): ResourceSettings<ProjectInstallsConfig> {
    return {
      id: 'project-installs',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleCloneAndInstall,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        directories: { type: 'array', itemType: 'directory', canModify: true },
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
        // refresh() only returns the in-sync subset of the desired directories, so match on that subset.
        matcher: (desired, current) =>
          sameManagers(desired.packageManagers, current.packageManagers)
          && (current.directories ?? []).every((c) => (desired.directories ?? []).some((d) => samePath(d, c))),
      },
      dependencies: DEPENDENCIES,
    }
  }

  /**
   * Returns only the directories that are fully installed. Out-of-date directories are left out so the plan shows
   * exactly which projects will be installed.
   */
  override async refresh(parameters: Partial<ProjectInstallsConfig>): Promise<Partial<ProjectInstallsConfig> | null> {
    const { directories, ...options } = parameters;

    const inSync: string[] = [];
    for (const directory of directories ?? []) {
      if (await isDirectoryInSync(directory, options)) {
        inSync.push(directory);
      }
    }

    if (inSync.length === 0) {
      return null;
    }

    return { ...parameters, directories: inSync };
  }

  override async create(plan: CreatePlan<ProjectInstallsConfig>): Promise<void> {
    const { directories, ...options } = plan.desiredConfig;
    for (const directory of directories) {
      await installDirectory(directory, options);
    }
  }

  override async modify(pc: ParameterChange<ProjectInstallsConfig>, plan: ModifyPlan<ProjectInstallsConfig>): Promise<void> {
    if (pc.name !== 'directories') {
      return;
    }

    const { directories: _, ...options } = plan.desiredConfig;
    const previous: string[] = pc.previousValue ?? [];
    const toInstall = (pc.newValue as string[] ?? []).filter((d) => !previous.some((p) => samePath(p, d)));

    // Directories removed from the list are left alone: this resource never deletes installed dependencies.
    for (const directory of toInstall) {
      await installDirectory(directory, options);
    }
  }

  override async destroy(_plan: DestroyPlan<ProjectInstallsConfig>): Promise<void> {}
}
