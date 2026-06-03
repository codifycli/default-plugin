import { ParameterSetting, Plan, StatefulParameter } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { untildify } from '../../utils/untildify.js';

type Settings = Record<string, unknown>;

export function resolveSettingsPath(directory?: string): string {
  if (directory) return path.join(untildify(directory), '.claude', 'settings.json');
  return path.join(os.homedir(), '.claude', 'settings.json');
}

export class SettingsParameter extends StatefulParameter<StringIndexedObject, Settings> {
  getSettings(): ParameterSetting {
    return { type: 'object' };
  }

  override async refresh(_desired: Settings | null, config: Partial<StringIndexedObject>): Promise<Settings | null> {
    const filePath = resolveSettingsPath(config['directory'] as string | undefined);
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as Settings;
    } catch {
      return null;
    }
  }

  async add(valueToAdd: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    await this.mergeIntoFile(valueToAdd, plan.desiredConfig?.['directory'] as string | undefined);
  }

  async modify(newValue: Settings, previousValue: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    const filePath = resolveSettingsPath(plan.desiredConfig?.['directory'] as string | undefined);
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

  async remove(valueToRemove: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    const directory = (plan.currentConfig?.['directory'] ?? plan.desiredConfig?.['directory']) as string | undefined;
    const filePath = resolveSettingsPath(directory);
    try {
      const existing = JSON.parse(await fs.readFile(filePath, 'utf8')) as Settings;
      for (const key of Object.keys(valueToRemove)) {
        delete existing[key];
      }
      await fs.writeFile(filePath, JSON.stringify(existing, null, 2));
    } catch { /* nothing to do if file doesn't exist */ }
  }

  private async mergeIntoFile(settings: Settings, directory?: string): Promise<void> {
    const filePath = resolveSettingsPath(directory);
    let existing: Settings = {};
    try {
      existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch { /* file may not exist yet */ }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ ...existing, ...settings }, null, 2));
  }
}
