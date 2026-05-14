import { ArrayParameterSetting, SpawnStatus, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { VscodeConfig } from './vscode.js';

export class ExtensionsParameter extends StatefulParameter<VscodeConfig, string[]> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      isElementEqual(desired, current) {
        return desired.toLowerCase() === current.toLowerCase();
      },
    };
  }

  override async refresh(): Promise<string[] | null> {
    const $ = getPty();
    const result = await $.spawnSafe('code --list-extensions');
    if (result.status !== SpawnStatus.SUCCESS || result.data == null) {
      return null;
    }
    return result.data.split('\n').filter(Boolean);
  }

  async add(toAdd: string[]): Promise<void> {
    const $ = getPty();
    for (const ext of toAdd) {
      await $.spawn(`code --install-extension ${ext} --force`, { interactive: true });
    }
  }

  async modify(newValue: string[], previousValue: string[]): Promise<void> {
    const toAdd = newValue.filter((n) => !previousValue.some((p) => p.toLowerCase() === n.toLowerCase()));
    const toRemove = previousValue.filter((p) => !newValue.some((n) => n.toLowerCase() === p.toLowerCase()));
    await this.remove(toRemove);
    await this.add(toAdd);
  }

  async remove(toRemove: string[]): Promise<void> {
    const $ = getPty();
    for (const ext of toRemove) {
      await $.spawnSafe(`code --uninstall-extension ${ext}`);
    }
  }
}
