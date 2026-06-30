import { ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';

import { AndroidCliConfig } from './android-cli.js';

export class AndroidSdkPackagesParameter extends ArrayStatefulParameter<AndroidCliConfig, string> {
  async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();

    const { status, data } = await $.spawnSafe('android sdk list');
    if (status === SpawnStatus.ERROR) return null;

    return data
      .split('\n')
      .filter((l) => l.match(/^\s{2}\S/))
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  async addItem(item: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`android sdk install "${item}"`, { interactive: true });
  }

  async removeItem(item: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`android sdk remove "${item}"`, { interactive: true });
  }
}
