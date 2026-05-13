import { ArrayStatefulParameter, getPty } from '@codifycli/plugin-core';

import { RbenvConfig } from './rbenv.js';

export class RubyVersionsParameter extends ArrayStatefulParameter<RbenvConfig, string> {
  override async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();
    const { data } = await $.spawnSafe('rbenv versions --bare');

    return parseInstalledVersions(data);
  }

  override async addItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`rbenv install ${version}`, { interactive: true });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`rbenv uninstall --force ${version}`, { interactive: true });
  }
}

function parseInstalledVersions(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
