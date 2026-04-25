import { ExampleConfig, Resource, ResourceSettings, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  directories: z.array(z.string()).describe('List of directories to run npm install in'),
});

export type NpmInstallConfig = z.infer<typeof schema> & ResourceConfig;

const defaultConfig: Partial<NpmInstallConfig> = {
  directories: [],
};

const exampleSingleProject: ExampleConfig = {
  title: 'Run npm install in a project directory',
  description: 'Ensure npm dependencies are installed in a specific project directory.',
  configs: [{
    type: 'npm-install',
    directories: ['~/projects/my-app'],
  }],
};

const exampleMultipleProjects: ExampleConfig = {
  title: 'Run npm install in multiple directories',
  description: 'Install npm dependencies across multiple projects in one step.',
  configs: [{
    type: 'npm-install',
    directories: ['~/projects/frontend', '~/projects/backend', '~/projects/shared'],
  }],
};

export class NpmInstallResource extends Resource<NpmInstallConfig> {
  getSettings(): ResourceSettings<NpmInstallConfig> {
    return {
      id: 'npm-install',
      defaultConfig,
      exampleConfigs: {
        example1: exampleSingleProject,
        example2: exampleMultipleProjects,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        directories: {
          type: 'array',
          itemType: 'directory',
          canModify: true,
          isElementEqual: (a, b) => path.resolve(a) === path.resolve(b),
          filterInStatelessMode: (desired, current) =>
            current.filter((c) => desired.some((d) => path.resolve(d) === path.resolve(c))),
        },
      },
      dependencies: ['npm', 'nvm', 'pnpm'],
      importAndDestroy: {
        preventDestroy: true,
      },
    };
  }

  async refresh(parameters: Partial<NpmInstallConfig>): Promise<Partial<NpmInstallConfig> | null> {
    const pty = getPty();
    const { status } = await pty.spawnSafe('which npm');
    if (status === 'error') {
      return null;
    }

    if (!parameters.directories || parameters.directories.length === 0) {
      return parameters;
    }

    // Return only directories that have node_modules installed
    const installed: string[] = [];
    for (const dir of parameters.directories) {
      const resolved = dir.replace(/^~/, process.env.HOME ?? '~');
      try {
        await fs.access(path.join(resolved, 'node_modules'));
        installed.push(dir);
      } catch {
        // node_modules doesn't exist — not installed
      }
    }

    return { directories: installed };
  }

  async create(plan: { desiredConfig: NpmInstallConfig }): Promise<void> {
    await this.runInstall(plan.desiredConfig.directories ?? []);
  }

  async modify(
    _pc: unknown,
    plan: { desiredConfig: NpmInstallConfig },
  ): Promise<void> {
    await this.runInstall(plan.desiredConfig.directories ?? []);
  }

  async destroy(): Promise<void> {
    // node_modules removal is intentionally left to the user; prevent destroy is set
  }

  private async runInstall(directories: string[]): Promise<void> {
    const $ = getPty();
    for (const dir of directories) {
      const resolved = dir.replace(/^~/, process.env.HOME ?? '~');
      await $.spawn(`npm install`, { cwd: resolved, interactive: true });
    }
  }
}
