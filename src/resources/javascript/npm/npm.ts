import { Resource, ResourceSettings, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas'

import { NpmInstallParameter } from './global-install.js';
import schema from './npm-schema.json'

export interface NpmConfig extends ResourceConfig {
  install: string[]
}

export class Npm extends Resource<NpmConfig> {
  getSettings(): ResourceSettings<NpmConfig> {
    return {
      id: 'npm',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        install: { type: 'stateful', definition: new NpmInstallParameter() },
      },
      importAndDestroy: {
        preventDestroy: true,
      },
      dependencies: ['nvm', 'pnpm']
    }
  }

  async refresh(parameters: Partial<NpmConfig>): Promise<Partial<NpmConfig> | Partial<NpmConfig>[] | null> {
    const pty = getPty();

    const { status } = await pty.spawnSafe('which npm')
    if (status === 'error') {
      return null;
    }

    return parameters;
  }

  // Npm gets created with NodeJS
  async create(): Promise<void> {}

  // Npm is destroyed with NodeJS
  async destroy(): Promise<void> {}

}
