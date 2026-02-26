import { ArrayStatefulParameter, getPty, Plan, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { AsdfConfig } from './asdf.js';

export class AsdfPluginsParameter extends ArrayStatefulParameter<AsdfConfig, string> {
  async refresh(desired: null | string[]): Promise<null | string[]> {
    const $ = getPty();

    const plugins = await $.spawnSafe('asdf plugin list')
    if (plugins.status === SpawnStatus.ERROR) {
      return null;
    }

    return plugins
      .data
      .split(/\n/)
      .filter(Boolean);
  }

  async addItem(item: string, plan: Plan<AsdfConfig>): Promise<void> {
    const pty = getPty();
    await pty.spawn(`asdf plugin add ${item}`, { interactive: true });
  }

  async removeItem(item: string, plan: Plan<AsdfConfig>): Promise<void> {
    const pty = getPty();
    await pty.spawn(`asdf plugin remove ${item}`, { interactive: true });
  }
}
