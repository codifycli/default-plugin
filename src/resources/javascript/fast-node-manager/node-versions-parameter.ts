import { ArrayParameterSetting, ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';

import { FnmConfig } from './fast-node-manager.js';

export class FnmNodeVersionsParameter extends ArrayStatefulParameter<FnmConfig, string> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      isElementEqual: (desired, current) => current.includes(desired),
    };
  }

  override async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('fnm list', { interactive: true });

    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return parseInstalledVersions(data);
  }

  override async addItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`fnm install ${version}`, { interactive: true });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`fnm uninstall ${version}`, { interactive: true });
  }
}

function parseInstalledVersions(output: string): string[] {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/v?(\d+\.\d+\.\d+)/);
      return match ? match[1] : null;
    })
    .filter((v): v is string => v !== null);
}
