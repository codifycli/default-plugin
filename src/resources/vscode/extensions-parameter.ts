import { ArrayParameterSetting, Plan, SpawnStatus, StatefulParameter, Utils, getPty } from '@codifycli/plugin-core';
import path from 'node:path';

import { VscodeConfig } from './vscode.js';

const VSCODE_APPLICATION_NAME = 'Visual Studio Code.app';

function getCodeBinary(directory?: string | null): string {
  if (Utils.isMacOS()) {
    // On macOS the code binary lives inside the app bundle. Use the full path so it
    // works immediately after install without requiring a new shell session.
    return path.join(
      directory ?? '/Applications',
      VSCODE_APPLICATION_NAME,
      'Contents', 'Resources', 'app', 'bin', 'code',
    );
  }
  // On Linux, the package manager installs code to /usr/bin/code (already on PATH).
  return 'code';
}

export class ExtensionsParameter extends StatefulParameter<VscodeConfig, string[]> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      isElementEqual(desired, current) {
        return desired.toLowerCase() === current.toLowerCase();
      },
    };
  }

  override async refresh(desired: string[] | null, config: Partial<VscodeConfig>): Promise<string[] | null> {
    const $ = getPty();
    const code = getCodeBinary(config.directory);
    const result = await $.spawnSafe(`"${code}" --list-extensions`);
    if (result.status !== SpawnStatus.SUCCESS || result.data == null) {
      return null;
    }
    return result.data.split('\n').filter(Boolean);
  }

  async add(valueToAdd: string[], plan: Plan<VscodeConfig>): Promise<void> {
    const $ = getPty();
    const code = getCodeBinary(plan.desiredConfig?.directory);
    for (const ext of valueToAdd) {
      await $.spawn(`"${code}" --install-extension ${ext} --force`, { interactive: true });
    }
  }

  async modify(newValue: string[], previousValue: string[], plan: Plan<VscodeConfig>): Promise<void> {
    const toAdd = newValue.filter((n) => !previousValue.some((p) => p.toLowerCase() === n.toLowerCase()));
    const toRemove = previousValue.filter((p) => !newValue.some((n) => n.toLowerCase() === p.toLowerCase()));
    await this.remove(toRemove, plan);
    await this.add(toAdd, plan);
  }

  async remove(valueToRemove: string[], plan: Plan<VscodeConfig>): Promise<void> {
    const $ = getPty();
    const code = getCodeBinary(plan.desiredConfig?.directory ?? plan.currentConfig?.directory);
    for (const ext of valueToRemove) {
      await $.spawnSafe(`"${code}" --uninstall-extension ${ext}`);
    }
  }
}
