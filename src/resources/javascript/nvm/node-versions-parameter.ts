import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { newestVersion, parseNodeReleaseList, stripV, VersionAlias } from '../../../utils/version-aliases.js';
import { VersionsParameter } from '../../../utils/versions-parameter.js';
import { NvmConfig } from './nvm.js';

// Requires whitespace or end of line after the version so prereleases (v27.0.0-alpha.0) never match
const VERSION_REGEX = /v?(\d+\.\d+\.\d+)(?=\s|$)/m;

export class NvmNodeVersionsParameter extends VersionsParameter<NvmConfig> {
  protected readonly supportedAliases = ['latest', 'lts'] as const;

  constructor() {
    super('nodeVersions');
  }

  protected async listInstalled(): Promise<string[]> {
    const $ = getPty();
    const { data } = await $.spawnSafe('nvm ls --no-colors --no-alias', { interactive: true });

    return data.split(/\n/)
      .map((l) => l.match(VERSION_REGEX)?.[1])
      .filter((v): v is string => Boolean(v));
  }

  // nvm has its own partial matching logic (20 -> 20.15.1) that we defer to.
  protected async matchInstalled(desired: string): Promise<null | string> {
    return this.nvmVersion(`nvm version ${desired}`);
  }

  // `nvm ls-remote` marks LTS releases with "(LTS: <codename>)". Prereleases are skipped by the parser.
  // Falls back to nvm's local aliases when the remote can't be reached.
  protected async resolveAlias(alias: VersionAlias): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('nvm ls-remote --no-colors', { interactive: true });

    if (status === SpawnStatus.SUCCESS) {
      const remote = parseNodeReleaseList(data).filter((r) => alias !== 'lts' || r.isLts);
      const resolved = newestVersion(remote.map((r) => r.version));
      if (resolved) {
        return resolved;
      }
    }

    return this.nvmVersion(alias === 'lts' ? 'nvm version "lts/*"' : 'nvm version node');
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
    const { data, status } = await $.spawnSafe(command, { interactive: true });
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    const match = data.match(VERSION_REGEX)?.[1];
    return match ? stripV(match) : null;
  }
}
