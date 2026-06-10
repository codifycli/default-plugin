import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type Settings = Record<string, unknown>;

export const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

export class OpenClawSettingsParameter extends StatefulParameter<StringIndexedObject, Settings> {
  getSettings(): ParameterSetting {
    return { type: 'object' };
  }

  override async refresh(_desired: Settings | null): Promise<Settings | null> {
    try {
      const content = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
      return JSON.parse(content) as Settings;
    } catch {
      return null;
    }
  }

  async add(valueToAdd: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    await this.mergeIntoFile(valueToAdd);
    await this.restartGateway();
  }

  async modify(newValue: Settings, previousValue: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    let existing: Settings = {};
    try {
      existing = JSON.parse(await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch { /* file may not exist */ }

    for (const key of Object.keys(previousValue)) {
      if (!(key in newValue)) {
        delete existing[key];
      }
    }

    Object.assign(existing, newValue);

    await fs.mkdir(path.dirname(OPENCLAW_CONFIG_PATH), { recursive: true });
    await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(existing, null, 2));
    await this.restartGateway();
  }

  async remove(valueToRemove: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    try {
      const existing = JSON.parse(await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8')) as Settings;
      for (const key of Object.keys(valueToRemove)) {
        delete existing[key];
      }
      await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(existing, null, 2));
    } catch { /* nothing to do if file doesn't exist */ }

    await this.restartGateway();
  }

  private async mergeIntoFile(settings: Settings): Promise<void> {
    let existing: Settings = {};
    try {
      existing = JSON.parse(await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8'));
    } catch { /* file may not exist yet */ }

    await fs.mkdir(path.dirname(OPENCLAW_CONFIG_PATH), { recursive: true });
    await fs.writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify({ ...existing, ...settings }, null, 2));
  }

  private async restartGateway(): Promise<void> {
    const $ = getPty();
    await $.spawnSafe('openclaw gateway restart', { interactive: true });
  }
}
