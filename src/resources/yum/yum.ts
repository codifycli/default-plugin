import { CreatePlan, Resource, ResourceSettings, SpawnStatus, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';

import { YumInstallParameter, YumPackage } from './install-parameter.js';
import schema from './yum-schema.json';

export interface YumConfig extends ResourceConfig {
  install: Array<YumPackage | string>;
  update?: boolean;
}

export class YumResource extends Resource<YumConfig> {

  override getSettings(): ResourceSettings<YumConfig> {
    return {
      id: 'yum',
      operatingSystems: [OS.Linux],
      schema,
      parameterSettings: {
        install: { type: 'stateful', definition: new YumInstallParameter() },
        update: { type: 'boolean', default: true, setting: true }
      }
    };
  }

  override async refresh(parameters: Partial<YumConfig>): Promise<Partial<YumConfig> | null> {
    const $ = getPty();

    const yumCheck = await $.spawnSafe('which yum');
    if (yumCheck.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(_plan: CreatePlan<YumConfig>): Promise<void> {
    const $ = getPty();

    // Update package lists
    await $.spawn('yum check-update', { requiresRoot: true, interactive: true });

    console.log('yum is already installed on this Red Hat-based system');
  }

  override async destroy(): Promise<void> {
    // yum is a core system component and should not be removed
    throw new Error('yum cannot be destroyed as it is a core system package manager');
  }
}
