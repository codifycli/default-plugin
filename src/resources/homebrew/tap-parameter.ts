import { ParameterSetting, SpawnStatus, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { HomebrewConfig } from './homebrew.js';

export class TapsParameter extends StatefulParameter<HomebrewConfig, string[]> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
    }
  }

  override async refresh(): Promise<null | string[]> {
    const $ = getPty();

    const tapsQuery = await $.spawnSafe('brew tap')
    if (tapsQuery.status === SpawnStatus.SUCCESS && tapsQuery.data !== null && tapsQuery.data !== undefined) {
      return tapsQuery.data
        .split('\n')
        .filter(Boolean)
    }

    return null;
  }

  override async add(valueToAdd: string[]): Promise<void> {
    await this.installTaps(valueToAdd);
  }

  override async modify(newValue: string[], previousValue: string[]): Promise<void> {
    const tapsToInstall = newValue.filter((x: string) => !previousValue.includes(x))
    const tapsToUninstall = previousValue.filter((x: string) => !newValue.includes(x))

    await this.installTaps(tapsToInstall);
    await this.uninstallTaps(tapsToUninstall)
  }

  override async remove(valueToRemove: string[]): Promise<void> {
    await this.uninstallTaps(valueToRemove);
  }

  private async installTaps(taps: string[]): Promise<void> {
    if (!taps || taps.length === 0) {
      return;
    }

    const $ = getPty();
    await $.spawn(`brew tap ${taps.join(' ')}`, {
      interactive: true,
      env: { HOMEBREW_NO_AUTO_UPDATE: 1 },
    })
  }

  private async uninstallTaps(taps: string[]): Promise<void> {
    if (!taps || taps.length === 0) {
      return;
    }

    const $ = getPty();
    await $.spawn(`brew untap ${taps.join(' ')}`, {
      interactive: true,
      env: { HOMEBREW_NO_AUTO_UPDATE: 1 },
    })
  }

}
