import { CreatePlan, Resource, ResourceSettings, SpawnStatus, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';

import schema from './dnf-schema.json';
import { DnfInstallParameter, DnfPackage } from './install-parameter.js';

export interface DnfConfig extends ResourceConfig {
  install: Array<DnfPackage | string>;
  update?: boolean;
}

export class DnfResource extends Resource<DnfConfig> {

  override getSettings(): ResourceSettings<DnfConfig> {
    return {
      id: 'dnf',
      operatingSystems: [OS.Linux],
      schema,
      parameterSettings: {
        install: { type: 'stateful', definition: new DnfInstallParameter() },
        update: { type: 'boolean', default: true, setting: true }
      }
    };
  }

  override async refresh(parameters: Partial<DnfConfig>): Promise<Partial<DnfConfig> | null> {
    const $ = getPty();

    const dnfCheck = await $.spawnSafe('which dnf');
    if (dnfCheck.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(_plan: CreatePlan<DnfConfig>): Promise<void> {
    const $ = getPty();

    // Update package lists
    await $.spawnSafe('dnf check-update', { requiresRoot: true, interactive: true });

    console.log('dnf is already installed on this Red Hat-based system');
  }

  override async destroy(): Promise<void> {
    // dnf is a core system component and should not be removed
    throw new Error('dnf cannot be destroyed as it is a core system package manager');
  }
}
