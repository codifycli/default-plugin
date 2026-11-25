import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { isStableVersion } from '../../../utils/version-aliases.js';
import { VersionsParameter } from '../../../utils/versions-parameter.js';
import { PyenvConfig } from './pyenv.js';

export class PythonVersionsParameter extends VersionsParameter<PyenvConfig> {
  protected readonly supportedAliases = ['latest'] as const;

  constructor() {
    super('pythonVersions');
  }

  protected async listInstalled(): Promise<string[]> {
    const $ = getPty();
    const { data } = await $.spawnSafe('pyenv versions --bare --skip-aliases --skip-envs');

    return data.split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }

  // pyenv does its own prefix resolution (3 -> 3.12.2), so defer to `pyenv latest`.
  protected async matchInstalled(desired: string): Promise<null | string> {
    return this.pyenvLatest(desired);
  }

  // `-k` resolves against the versions pyenv knows how to build (local definitions, no network needed).
  // Falls back to the newest installed CPython.
  protected async resolveAlias(): Promise<null | string> {
    return (await this.pyenvLatest('3', true)) ?? this.pyenvLatest('3');
  }

  protected async installVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pyenv install ${version} -s`, { interactive: true });
  }

  protected async uninstallVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pyenv uninstall ${version} -f`, { interactive: true });
  }

  private async pyenvLatest(prefix: string, known = false): Promise<null | string> {
    const $ = getPty();
    const { status, data } = await $.spawnSafe(`pyenv latest ${known ? '-k ' : ''}${prefix}`);
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    const version = data.trim();
    // Guard against anything other than a plain CPython release (ex: free threaded 3.13.0t) for the keyword
    return version && (!known || isStableVersion(version)) ? version : null;
  }
}
