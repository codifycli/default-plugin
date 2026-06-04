import { ArrayParameterSetting, Plan, SpawnStatus, StatefulParameter, Utils, getPty } from '@codifycli/plugin-core';
import os from 'node:os';
import path from 'node:path';

import { CURSOR_APPLICATION_NAME, CURSOR_LOCAL_BIN, CursorConfig } from './cursor.js';

function getCursorBinary(directory?: string | null): string {
  if (Utils.isMacOS()) {
    // On macOS the cursor binary lives inside the app bundle. Use the full path so it
    // works immediately after install without requiring a new shell session.
    return path.join(
      directory ?? '/Applications',
      CURSOR_APPLICATION_NAME,
      'Contents', 'Resources', 'app', 'bin', 'cursor',
    );
  }
  // On Linux, prefer the directory-scoped path (AppImage install), but fall back to
  // the system PATH location (apt/dnf install puts it at /usr/bin/cursor).
  return path.join(directory ?? CURSOR_LOCAL_BIN, 'cursor');
}

async function resolveCursorBinary(directory?: string | null): Promise<string> {
  if (Utils.isMacOS()) return getCursorBinary(directory);
  const candidate = getCursorBinary(directory);
  const $ = getPty();
  const check = await $.spawnSafe(`test -x "${candidate}"`);
  if (check.status === SpawnStatus.SUCCESS) return candidate;
  // Fall back to whatever is on PATH (e.g. /usr/bin/cursor from apt install)
  const which = await $.spawnSafe('which cursor');
  if (which.status === SpawnStatus.SUCCESS) return which.data.trim();
  return candidate;
}

export class ExtensionsParameter extends StatefulParameter<CursorConfig, string[]> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      isElementEqual(desired, current) {
        return desired.toLowerCase() === current.toLowerCase();
      },
    };
  }

  override async refresh(desired: string[] | null, config: Partial<CursorConfig>): Promise<string[] | null> {
    const $ = getPty();
    const cursor = await resolveCursorBinary(config.directory);
    const result = await $.spawnSafe(`"${cursor}" --list-extensions`);
    if (result.status !== SpawnStatus.SUCCESS || result.data == null) {
      return null;
    }
    return result.data.split('\n').filter(Boolean);
  }

  async add(valueToAdd: string[], plan: Plan<CursorConfig>): Promise<void> {
    const $ = getPty();
    const cursor = await resolveCursorBinary(plan.desiredConfig?.directory);
    for (const ext of valueToAdd) {
      await $.spawn(`"${cursor}" --install-extension ${ext}`, { interactive: true });
    }
  }

  async modify(newValue: string[], previousValue: string[], plan: Plan<CursorConfig>): Promise<void> {
    const toAdd = newValue.filter((n) => !previousValue.some((p) => p.toLowerCase() === n.toLowerCase()));
    const toRemove = previousValue.filter((p) => !newValue.some((n) => n.toLowerCase() === p.toLowerCase()));
    await this.remove(toRemove, plan);
    await this.add(toAdd, plan);
  }

  async remove(valueToRemove: string[], plan: Plan<CursorConfig>): Promise<void> {
    const $ = getPty();
    const cursor = await resolveCursorBinary(plan.desiredConfig?.directory ?? plan.currentConfig?.directory);
    for (const ext of valueToRemove) {
      await $.spawnSafe(`"${cursor}" --uninstall-extension ${ext}`);
    }
  }
}
