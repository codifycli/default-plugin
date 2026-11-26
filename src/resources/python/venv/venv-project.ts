import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  getPty,
  z
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import { requiresOnMacOS } from '../../../utils/requires.js';

export const schema = z.object({
  envDir: z.string().describe('A directory to create the environment in.'),
  systemSitePackages: z.boolean().optional().describe('Give the virtual environment access to the system site-packages dir.'),
  symlinks: z.boolean().optional().describe('Try to use symlinks rather than copies, when symlinks are not the default for the platform.'),
  copies: z.boolean().optional().describe('Delete the contents of the environment directory if it already exists, before environment creation.'),
  clear: z.boolean().optional().describe('Try to use symlinks rather than copies (default: true).'),
  upgrade: z.boolean().optional().describe('Upgrade the environment directory to use this version of Python, assuming Python has been upgraded in-place.'),
  withoutPip: z.boolean().optional().describe('Skips installing or upgrading pip in the virtual environment (pip is bootstrapped by default).'),
  prompt: z.string().optional().describe('Provides an alternative prompt prefix for this environment.'),
  upgradeDeps: z.boolean().optional().describe('Upgrade core dependencies: pip setuptools to the latest version in PyPI.'),
  cwd: z.string().optional().describe('The cwd to create virtualenv from. This allows a relative path to be used for dest.'),
  automaticallyInstallRequirementsTxt: z.boolean().optional().describe('If an requirements.txt is available in the cwd, automatically install it when a virtual env is first created.'),
})
  .describe('Install and manage local packages for a project with venv');

export type VenvProjectConfig = z.infer<typeof schema>;

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
      requires: requiresOnMacOS('xcode-tools'),
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
