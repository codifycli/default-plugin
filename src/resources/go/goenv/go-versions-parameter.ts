import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { isStableVersion, newestVersion } from '../../../utils/version-aliases.js';
import { VersionsParameter } from '../../../utils/versions-parameter.js';
import { GoenvConfig } from './goenv.js';

export class GoVersionsParameter extends VersionsParameter<GoenvConfig> {
  protected readonly supportedAliases = ['latest'] as const;

  constructor() {
    super('goVersions');
  }

  protected async listInstalled(): Promise<string[]> {
    const $ = getPty();
    const { data } = await $.spawnSafe('goenv versions --bare');
    return parseLines(data);
  }

  // `goenv install --list` prints every release goenv knows about, including betas and release candidates
  // (1.23rc1), which isStableVersion filters out. Falls back to the newest installed version.
  protected async resolveAlias(_alias: unknown, installed: string[]): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('goenv install --list');
    const available = status === SpawnStatus.SUCCESS ? parseLines(data) : [];

    return newestVersion(available, isStableVersion) ?? newestVersion(installed, isStableVersion);
  }

  protected async installVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`goenv install --skip-existing ${version}`, { interactive: true });
  }

  protected async uninstallVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`goenv uninstall --force ${version}`, { interactive: true });
  }
}

function parseLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
