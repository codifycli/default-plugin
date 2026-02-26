import { CreatePlan, DestroyPlan, getPty, Resource, ResourceSettings, Utils } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';

import schema from './virtualenv-schema.json';

export interface VirtualenvConfig extends ResourceConfig {}

export class Virtualenv extends Resource<VirtualenvConfig> {

  getSettings(): ResourceSettings<VirtualenvConfig> {
    return {
      id: 'virtualenv',
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
