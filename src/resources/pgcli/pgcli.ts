import { Resource, ResourceSettings, SpawnStatus, getPty, Utils, z } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import { requiresOnMacOS } from '../../utils/requires.js';

export const schema = z.object({})
  .describe('Installs pgcli.');


export type PgcliConfig = z.infer<typeof schema>;

export class PgcliResource extends Resource<PgcliConfig> {
  getSettings(): ResourceSettings<PgcliConfig> {
    return {
      id: 'pgcli',
      requires: requiresOnMacOS('homebrew'),
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
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
