import { ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';

import { AndroidCliConfig } from './android-cli.js';

export class AndroidEmulatorsParameter extends ArrayStatefulParameter<AndroidCliConfig, string> {
  async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();

    const { status, data } = await $.spawnSafe('android emulator list', { interactive: true });
    if (status === SpawnStatus.ERROR) return null;

    return data
      .split('\n')
      .map((l) => l.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  async addItem(item: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`android emulator create "${item}"`, { interactive: true });
  }

  async removeItem(item: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`android emulator remove "${item}"`, { interactive: true });
  }
}
