import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { matchVersionPrefix, newestVersion, VersionAlias } from '../../../utils/version-aliases.js';
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

    return parseFnmList(data).map((l) => l.version);
  }

  protected async matchInstalled(desired: string, installed: string[]): Promise<null | string> {
    return matchVersionPrefix(desired, installed);
  }

  protected async resolveAlias(alias: VersionAlias, installed: string[]): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('fnm list-remote', { interactive: true });

    if (status === SpawnStatus.SUCCESS) {
      const remote = parseFnmList(data);
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
      return parseFnmList(list).find((l) => l.annotations.includes('lts-latest'))?.version ?? null;
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

interface FnmListLine {
  version: string;
  /** Text after the version: aliases for `fnm list` ("default, lts-latest"), LTS codename for `fnm list-remote` ("(Jod)") */
  annotations: string;
  isLts: boolean;
}

/**
 * Parses `fnm list` (`* v22.11.0 default, lts-latest`) and `fnm list-remote` (`v22.11.0 (Jod)`) output.
 */
export function parseFnmList(output: string): FnmListLine[] {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/v(\d+\.\d+\.\d+)(.*)$/);
      if (!match) {
        return null;
      }

      const annotations = match[2].trim();
      return { version: match[1], annotations, isLts: /\(.+\)/.test(annotations) };
    })
    .filter((l): l is FnmListLine => l !== null);
}
