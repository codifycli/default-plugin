import { CreatePlan, Resource, ResourceSettings, SpawnStatus, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';

import schema from './apt-schema.json';
import { AptInstallParameter, AptPackage } from './install-parameter.js';

export interface AptConfig extends ResourceConfig {
  install: Array<AptPackage | string>;
  update?: boolean;
}

export class AptResource extends Resource<AptConfig> {

  override getSettings(): ResourceSettings<AptConfig> {
    return {
      id: 'apt',
      operatingSystems: [OS.Linux],
      schema,
      removeStatefulParametersBeforeDestroy: true,
      parameterSettings: {
        install: { type: 'stateful', definition: new AptInstallParameter() },
        update: { type: 'boolean', default: true, setting: true }
      }
    };
  }

  override async refresh(parameters: Partial<AptConfig>): Promise<Partial<AptConfig> | null> {
    const $ = getPty();

    const aptCheck = await $.spawnSafe('which apt-get');
    if (aptCheck.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(_plan: CreatePlan<AptConfig>): Promise<void> {
    const $ = getPty();

    // Update package lists
    await $.spawn('apt-get update', { requiresRoot: true, interactive: true });

    console.log('apt is already installed on this Debian-based system');
  }

  override async destroy(): Promise<void> {
    // apt is a core system component and should not be removed
    console.warn('apt cannot be destroyed as it is a core system package manager');
  }
}
