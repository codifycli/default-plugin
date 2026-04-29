import { CreatePlan, DestroyPlan, ExampleConfig, getPty, RefreshContext, Resource, ResourceSettings } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';

import schema from './pip-sync-schema.json'
import { RequirementFilesParameter } from './requirement-files-parameter.js';

export interface PipSyncConfig extends ResourceConfig {
  requirementFiles: string[];
  virtualEnv?: string;
  cwd?: string;
}

const defaultConfig: Partial<PipSyncConfig> = {
  requirementFiles: ['requirements.txt'],
  cwd: '<Replace me here!>'
}

const exampleWithVirtualenv: ExampleConfig = {
  title: 'Sync packages into a virtualenv',
  description: 'Install pip-tools and sync dependencies from a compiled requirements file into a dedicated virtualenv.',
  configs: [{
    type: 'pip-sync',
    requirementFiles: ['requirements.txt'],
    virtualEnv: '.venv',
    cwd: '<Replace me here!>',
  }]
}

export class PipSync extends Resource<PipSyncConfig> {
  getSettings(): ResourceSettings<PipSyncConfig> {
    return {
      id: 'pip-sync',
      defaultConfig,
      exampleConfigs: {
        example1: exampleWithVirtualenv,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        requirementFiles: { type: 'stateful', definition: new RequirementFilesParameter() },
        virtualEnv: { type: 'directory', setting: true },
        cwd: { type: 'directory', setting: true }
      },
      dependencies: ['pyenv', 'pip', 'venv-project', 'virtualenv-project', 'virtualenv'],
      allowMultiple: {
        identifyingParameters: ['virtualEnv'],
      },
      importAndDestroy: {
        preventImport: true,
      }
    };
  }

  async refresh(parameters: Partial<PipSyncConfig>, context: RefreshContext<PipSyncConfig>): Promise<Partial<PipSyncConfig> | Partial<PipSyncConfig>[] | null> {
    const pty = getPty()

    const { status: pipStatus } = await pty.spawnSafe(PipSync.withVirtualEnv('which pip', parameters.virtualEnv), { cwd: parameters.cwd ?? undefined });
    if (pipStatus === 'error') {
      return null;
    }

    const { status: pipSyncStatus } = await pty.spawnSafe(PipSync.withVirtualEnv('which pip-sync', parameters.virtualEnv), { cwd: parameters.cwd ?? undefined })
    return pipSyncStatus === 'error' ? null : parameters;
  }

  async create(plan: CreatePlan<PipSyncConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(PipSync.withVirtualEnv('pip install pip-tools', plan.desiredConfig.virtualEnv), { cwd: plan.desiredConfig.cwd ?? undefined, interactive: true })
  }

  async destroy(plan: DestroyPlan<PipSyncConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(PipSync.withVirtualEnv('pip uninstall -y pip-tools', plan.currentConfig.virtualEnv), { cwd: plan.currentConfig.cwd ?? undefined, interactive: true })
  }

  static withVirtualEnv(command: string, virtualEnv?: string, ): string {
    if (!virtualEnv) {
      return command;
    }

    return `( set -e; source ${virtualEnv}/bin/activate; ${command}; deactivate )`;
  }

}
