import { ParameterSetting, StatefulParameter, Utils } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CursorConfig } from './cursor.js';

type Settings = Record<string, unknown>;

export class SettingsParameter extends StatefulParameter<CursorConfig, Settings> {
  getSettings(): ParameterSetting {
    return { type: 'object' };
  }

  override async refresh(): Promise<Settings | null> {
    try {
      const content = await fs.readFile(getSettingsPath(), 'utf8');
      return JSON.parse(content) as Settings;
    } catch {
      return null;
    }
  }

  async add(valueToAdd: Settings): Promise<void> {
    await writeSettings(valueToAdd);
  }

  async modify(newValue: Settings, previousValue: Settings): Promise<void> {
    const filePath = getSettingsPath();
    let existing: Settings = {};
    try {
      existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch { /* file may not exist */ }

    // Remove keys that were in the previous declaration but are no longer desired
    for (const key of Object.keys(previousValue)) {
      if (!(key in newValue)) {
        delete existing[key];
      }
    }

    // Apply all new/changed keys
    Object.assign(existing, newValue);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
  }

  async remove(valueToRemove: Settings): Promise<void> {
    const filePath = getSettingsPath();
    try {
      const existing = JSON.parse(await fs.readFile(filePath, 'utf8')) as Settings;
      for (const key of Object.keys(valueToRemove)) {
        delete existing[key];
      }
      await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
    } catch { /* nothing to do if file doesn't exist */ }
  }
}

function getSettingsPath(): string {
  return Utils.isMacOS()
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'settings.json')
    : path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json');
}

async function writeSettings(settings: Settings): Promise<void> {
  const filePath = getSettingsPath();
  let existing: Settings = {};
  try {
    existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch { /* file may not exist yet */ }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ ...existing, ...settings }, null, 2));
}
