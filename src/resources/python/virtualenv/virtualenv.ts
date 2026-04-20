import { CreatePlan, DestroyPlan, ExampleConfig, getPty, Resource, ResourceSettings, Utils } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';

import schema from './virtualenv-schema.json';

export interface VirtualenvConfig extends ResourceConfig {}

const exampleWithProject: ExampleConfig = {
  title: 'Install virtualenv and set up a project environment',
  description: 'Install virtualenv and create an isolated environment for a Python project, automatically installing dependencies from requirements.txt.',
  configs: [
    {
      type: 'virtualenv',
    },
    {
      type: 'virtualenv-project',
      dest: '.venv',
      cwd: '~/projects/my-python-project',
      automaticallyInstallRequirementsTxt: true,
      dependsOn: ['virtualenv'],
    },
  ]
}

export class Virtualenv extends Resource<VirtualenvConfig> {

  getSettings(): ResourceSettings<VirtualenvConfig> {
    return {
      id: 'virtualenv',
      exampleConfigs: {
        example1: exampleWithProject,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['homebrew'],
    }
  }

  async refresh(parameters: Partial<VirtualenvConfig>): Promise<Partial<VirtualenvConfig> | Partial<VirtualenvConfig>[] | null> {
    const pty = getPty()

    const { status } = await pty.spawnSafe('which virtualenv');
    return status === 'error' ? null : parameters;
  }

  async create(plan: CreatePlan<VirtualenvConfig>): Promise<void> {
    await Utils.installViaPkgMgr('virtualenv');
  }

  async destroy(plan: DestroyPlan<VirtualenvConfig>): Promise<void> {
    await Utils.uninstallViaPkgMgr('virtualenv');
  }
}
