import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { matchVersionPrefix, newestVersion, parseNodeReleaseList, VersionAlias } from '../../../utils/version-aliases.js';
import { VersionsParameter } from '../../../utils/versions-parameter.js';
import { FnmConfig } from './fast-node-manager.js';

export class FnmNodeVersionsParameter extends VersionsParameter<FnmConfig> {
  protected readonly supportedAliases = ['latest', 'lts'] as const;

  constructor() {
    super('nodeVersions');
  }

  protected async listInstalled(): Promise<null | string[]> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('fnm list', { interactive: true });
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return parseNodeReleaseList(data).map((l) => l.version);
  }

  protected async matchInstalled(desired: string, installed: string[]): Promise<null | string> {
    return matchVersionPrefix(desired, installed);
  }

  protected async resolveAlias(alias: VersionAlias, installed: string[]): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('fnm list-remote', { interactive: true });

    if (status === SpawnStatus.SUCCESS) {
      const remote = parseNodeReleaseList(data);
      const resolved = newestVersion(
        remote.filter((r) => alias !== 'lts' || r.isLts).map((r) => r.version),
      );
      if (resolved) {
        return resolved;
      }
    }

    // Offline fallback: the newest installed version (for lts, the one fnm aliased as lts-latest)
    if (alias === 'lts') {
      const { data: list } = await $.spawnSafe('fnm list', { interactive: true });
      return parseNodeReleaseList(list).find((l) => l.annotations.includes('lts-latest'))?.version ?? null;
    }

    return newestVersion(installed);
  }

  protected async installVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`fnm install ${version}`, { interactive: true });
  }

  protected async uninstallVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`fnm uninstall ${version}`, { interactive: true });
  }
}
