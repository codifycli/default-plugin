import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { VersionAlias, stripV } from '../../../utils/version-aliases.js';
import { VersionsParameter } from '../../../utils/versions-parameter.js';
import { NvmConfig } from './nvm.js';

const VERSION_REGEX = /v?(\d+\.\d+\.\d+)/;

export class NvmNodeVersionsParameter extends VersionsParameter<NvmConfig> {
  protected readonly supportedAliases = ['latest', 'lts'] as const;

  constructor() {
    super('nodeVersions');
  }

  protected async listInstalled(): Promise<string[]> {
    const $ = getPty();
    const { data } = await $.spawnSafe('nvm ls --no-colors --no-alias');

    return data.split(/\n/)
      .map((l) => l.match(VERSION_REGEX)?.[1])
      .filter((v): v is string => Boolean(v));
  }

  // nvm has its own partial matching logic (20 -> 20.15.1) that we defer to.
  protected async matchInstalled(desired: string): Promise<null | string> {
    return this.nvmVersion(`nvm version ${desired}`);
  }

  protected async resolveAlias(alias: VersionAlias): Promise<null | string> {
    const remote = alias === 'lts' ? 'nvm version-remote --lts' : 'nvm version-remote node';
    const local = alias === 'lts' ? 'nvm version "lts/*"' : 'nvm version node';

    return (await this.nvmVersion(remote)) ?? this.nvmVersion(local);
  }

  protected async installVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`nvm install ${version}`, { interactive: true });
  }

  protected async uninstallVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`nvm uninstall ${version}`, { interactive: true });
  }

  /** Runs an nvm command that prints a single version (or N/A) and returns it without the v prefix. */
  private async nvmVersion(command: string): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe(command);
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    const match = data.match(VERSION_REGEX)?.[1];
    return match ? stripV(match) : null;
  }
}
