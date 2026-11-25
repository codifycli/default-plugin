import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { isStableVersion, newestVersion } from '../../../utils/version-aliases.js';
import { VersionsParameter } from '../../../utils/versions-parameter.js';
import { RbenvConfig } from './rbenv.js';

export class RubyVersionsParameter extends VersionsParameter<RbenvConfig> {
  protected readonly supportedAliases = ['latest'] as const;

  constructor() {
    super('rubyVersions');
  }

  protected async listInstalled(): Promise<string[]> {
    const $ = getPty();
    const { data } = await $.spawnSafe('rbenv versions --bare', { interactive: true });
    return parseLines(data);
  }

  // `rbenv install --list` prints the latest stable release of each Ruby implementation (from ruby-build's local
  // definitions). Plain x.y.z entries are MRI. Falls back to the newest installed MRI version.
  protected async resolveAlias(_alias: unknown, installed: string[]): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('rbenv install --list', { interactive: true });
    const available = status === SpawnStatus.SUCCESS ? parseLines(data) : [];

    return newestVersion(available, isStableVersion) ?? newestVersion(installed, isStableVersion);
  }

  protected async installVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`rbenv install --skip-existing ${version}`, { interactive: true });
  }

  protected async uninstallVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`rbenv uninstall --force ${version}`, { interactive: true });
  }
}

function parseLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
