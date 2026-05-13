import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  getPty
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import schema from './venv-project-schema.json';

export interface VenvProjectConfig extends ResourceConfig {
  envDir: string;
  systemSitePackages?: boolean;
  symlinks?: boolean;
  copies?: boolean;
  clear?: boolean;
  upgrade?: boolean;
  withoutPip?: boolean;
  prompt?: string;
  upgradeDeps?: boolean;
  cwd?: string;
  automaticallyInstallRequirementsTxt?: boolean;
}

const defaultConfig: Partial<VenvProjectConfig> = {
  envDir: '.venv',
  upgradeDeps: true,
  automaticallyInstallRequirementsTxt: true,
}

const exampleBasic: ExampleConfig = {
  title: 'Create a virtual environment',
  description: 'Create a Python virtual environment in the project directory and automatically install dependencies from requirements.txt.',
  configs: [{
    type: 'venv-project',
    envDir: '.venv',
    cwd: '~/projects/my-project',
    automaticallyInstallRequirementsTxt: true,
    upgradeDeps: true,
  }]
}

const exampleWithRepo: ExampleConfig = {
  title: 'Clone a repo and set up a virtual environment',
  description: 'Clone a Python project and immediately create a virtual environment with its dependencies installed.',
  configs: [
    {
      type: 'git-repository',
      repository: 'git@github.com:org/my-python-project.git',
      directory: '~/projects/my-python-project',
    },
    {
      type: 'venv-project',
      envDir: '.venv',
      cwd: '~/projects/my-python-project',
      automaticallyInstallRequirementsTxt: true,
      upgradeDeps: true,
      dependsOn: ['git-repository'],
    },
  ]
}

export class VenvProject extends Resource<VenvProjectConfig> {

  getSettings(): ResourceSettings<VenvProjectConfig> {
    return {
      id: 'venv-project',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleWithRepo,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        envDir: { type: 'directory' },
        systemSitePackages: { type: 'boolean', setting: true },
        symlinks: { type: 'boolean', setting: true },
        copies: { type: 'boolean', setting: true },
        upgrade: { type: 'boolean', setting: true },
        withoutPip: { type: 'boolean', setting: true },
        prompt: { type: 'string', setting: true },
        upgradeDeps: { type: 'boolean', setting: true },
        cwd: { type: 'directory', setting: true },
        automaticallyInstallRequirementsTxt: { type: 'boolean', setting: true },
      },
      allowMultiple: {
        identifyingParameters: ['envDir'],
      },
      dependencies: ['homebrew', 'pyenv', 'git-repository']
    }
  }

  async refresh(parameters: Partial<VenvProjectConfig>): Promise<Partial<VenvProjectConfig> | Partial<VenvProjectConfig>[] | null> {
    const dir = parameters.cwd
      ? path.join(parameters.cwd, parameters.envDir!)
      : parameters.envDir!;

    if (!(await FileUtils.exists(dir))) {
      return null;
    }

    if (!(await FileUtils.exists(path.join(dir, 'pyvenv.cfg')))) {
      return null;
    }

    return parameters;
  }

  async create(plan: CreatePlan<VenvProjectConfig>): Promise<void> {
    const $ = getPty();
    const desired = plan.desiredConfig;

    const command = 'python -m venv ' +
      (desired.systemSitePackages ? `--system-site-packages=${desired.systemSitePackages} ` : '') +
      (desired.symlinks ? '--symlinks ' : '') +
      (desired.copies ? '--copies ' : '') +
      (desired.clear ? '--clear ' : '') +
      (desired.upgrade ? '--upgrade ' : '') +
      (desired.withoutPip ? '--withoutPip ' : '') +
      (desired.prompt ? `--prompt ${desired.prompt} ` : '') +
      (desired.upgradeDeps ? '--upgradeDeps ' : '') +
      desired.envDir;

    await $.spawn(command, { cwd: desired.cwd ?? undefined, interactive: true });

    if (desired.automaticallyInstallRequirementsTxt) {
      await $.spawn(`source ${desired.envDir}/bin/activate; pip install -r requirements.txt`, { cwd: desired.cwd, interactive: true });
    }
  }

  async destroy(plan: DestroyPlan<VenvProjectConfig>): Promise<void> {
    const current = plan.currentConfig;

    const dir = current.cwd
      ? path.join(current.cwd, current.envDir!)
      : current.envDir!;

    await fs.rm(dir, { recursive: true, force: true });
  }
}
