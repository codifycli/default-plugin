import { ArrayStatefulParameter, getPty } from '@codifycli/plugin-core';

import { GoenvConfig } from './goenv.js';

export class GoVersionsParameter extends ArrayStatefulParameter<GoenvConfig, string> {
  override async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();
    const { data } = await $.spawnSafe('goenv versions --bare');
    return parseInstalledVersions(data);
  }

  override async addItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`goenv install ${version}`, { interactive: true });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`goenv uninstall --force ${version}`, { interactive: true });
  }
}

function parseInstalledVersions(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
