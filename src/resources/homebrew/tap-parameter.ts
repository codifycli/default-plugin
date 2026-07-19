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

    const tapsQuery = await $.spawnSafe('brew tap', { env: { NONINTERACTIVE: 1 }})
    if (tapsQuery.status === SpawnStatus.SUCCESS && tapsQuery.data !== null && tapsQuery.data !== undefined) {
      return tapsQuery.data
        .split('\n')
        .map((line) => line.trim())
        .filter((t) => t !== 'homebrew/bundle' && t !== 'homebrew/services')
        .filter(Boolean)
        // Some taps emit Ruby deprecation warnings to stderr, which the PTY interleaves
        // into this output. Real tap names are always `owner/repo`, with no whitespace.
        .filter((t) => !t.includes(' '))
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
    for (const tap of taps) {
      await $.spawn(`brew tap ${tap}`, {
        interactive: true,
        env: { HOMEBREW_NO_AUTO_UPDATE: 1, HOMEBREW_NO_ASK: 1, NONINTERACTIVE: 1 },
      });
      // Homebrew 5.x+ requires taps to be explicitly trusted before their formulae/casks
      // can be installed by short name. Auto-trust user-declared taps since they've opted in.
      await $.spawnSafe(`brew trust ${tap}`, {
        env: { HOMEBREW_NO_AUTO_UPDATE: 1, NONINTERACTIVE: 1 },
      });
    }
  }

  private async uninstallTaps(taps: string[]): Promise<void> {
    if (!taps || taps.length === 0) {
      return;
    }

    const $ = getPty();
    for (const tap of taps) {
      await $.spawn(`brew untap ${tap}`, {
        interactive: true,
        env: { HOMEBREW_NO_AUTO_UPDATE: 1, HOMEBREW_NO_ASK: 1, NONINTERACTIVE: 1 },
      });
    }
  }

}
