import { ParameterSetting, StatefulParameter } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ClaudeCodeConfig } from './claude-code.js';

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

type Settings = Record<string, unknown>;

export class SettingsParameter extends StatefulParameter<ClaudeCodeConfig, Settings> {
  getSettings(): ParameterSetting {
    return { type: 'object' };
  }

  override async refresh(): Promise<Settings | null> {
    try {
      const content = await fs.readFile(SETTINGS_PATH, 'utf8');
      return JSON.parse(content) as Settings;
    } catch {
      return null;
    }
  }

  async add(valueToAdd: Settings): Promise<void> {
    await this.mergeIntoFile(valueToAdd);
  }

  async modify(newValue: Settings, previousValue: Settings): Promise<void> {
    const filePath = SETTINGS_PATH;
    let existing: Settings = {};
    try {
      existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch { /* file may not exist */ }

    for (const key of Object.keys(previousValue)) {
      if (!(key in newValue)) {
        delete existing[key];
      }
    }

    Object.assign(existing, newValue);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
  }

  async remove(valueToRemove: Settings): Promise<void> {
    try {
      const existing = JSON.parse(await fs.readFile(SETTINGS_PATH, 'utf8')) as Settings;
      for (const key of Object.keys(valueToRemove)) {
        delete existing[key];
      }
      await fs.writeFile(SETTINGS_PATH, JSON.stringify(existing, null, 2));
    } catch { /* nothing to do if file doesn't exist */ }
  }

  private async mergeIntoFile(settings: Settings): Promise<void> {
    let existing: Settings = {};
    try {
      existing = JSON.parse(await fs.readFile(SETTINGS_PATH, 'utf8'));
    } catch { /* file may not exist yet */ }

    await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
    await fs.writeFile(SETTINGS_PATH, JSON.stringify({ ...existing, ...settings }, null, 2));
  }
}
