import { Resource, ResourceSettings, SpawnStatus, getPty, Utils } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';

import Schema from './pgcli-schema.json';

export interface PgcliConfig extends ResourceConfig {}

export class PgcliResource extends Resource<PgcliConfig> {
  getSettings(): ResourceSettings<PgcliConfig> {
    return {
      id: 'pgcli',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      dependencies: [...Utils.isMacOS() ? ['homebrew'] : []],
    }
  }

  override async refresh(): Promise<Partial<PgcliConfig> | null> {
    const $ = getPty();

    const result = await $.spawnSafe('which pgcli');
    if (result.status === SpawnStatus.ERROR) {
      return null;
    }

    return {}
  }

  override async create(): Promise<void> {
    await Utils.installViaPkgMgr('pgcli');
  }

  override async destroy(): Promise<void> {
    await Utils.uninstallViaPkgMgr('pgcli');
  }

}
