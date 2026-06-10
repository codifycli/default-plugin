import { ParameterSetting, Plan, StatefulParameter } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as TOML from 'smol-toml';

import { untildify } from '../../utils/untildify.js';

type Settings = Record<string, unknown>;

export function resolveConfigTomlPath(directory?: string): string {
  if (directory) return path.join(untildify(directory), '.codex', 'config.toml');
  return path.join(os.homedir(), '.codex', 'config.toml');
}

export async function readConfigToml(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return TOML.parse(content) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function writeConfigToml(filePath: string, data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, TOML.stringify(data), 'utf8');
}

/**
 * Manages arbitrary top-level keys of ~/.codex/config.toml (or <directory>/.codex/config.toml),
 * leaving the `mcp_servers` table (managed by CodexMcpServersParameter) untouched.
 */
export class CodexConfigParameter extends StatefulParameter<StringIndexedObject, Settings> {
  getSettings(): ParameterSetting {
    return { type: 'object' };
  }

  override async refresh(_desired: Settings | null, config: Partial<StringIndexedObject>): Promise<Settings | null> {
    const filePath = resolveConfigTomlPath(config['directory'] as string | undefined);
    try {
      const data = await readConfigToml(filePath);
      const { mcp_servers: _mcpServers, ...rest } = data;
      return rest;
    } catch {
      return null;
    }
  }

  async add(valueToAdd: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    const filePath = resolveConfigTomlPath(plan.desiredConfig?.['directory'] as string | undefined);
    const existing = await readConfigToml(filePath);
    await writeConfigToml(filePath, { ...existing, ...valueToAdd });
  }

  async modify(newValue: Settings, previousValue: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    const filePath = resolveConfigTomlPath(plan.desiredConfig?.['directory'] as string | undefined);
    const existing = await readConfigToml(filePath);

    for (const key of Object.keys(previousValue)) {
      if (!(key in newValue)) {
        delete existing[key];
      }
    }

    Object.assign(existing, newValue);
    await writeConfigToml(filePath, existing);
  }

  async remove(valueToRemove: Settings, plan: Plan<StringIndexedObject>): Promise<void> {
    const directory = (plan.currentConfig?.['directory'] ?? plan.desiredConfig?.['directory']) as string | undefined;
    const filePath = resolveConfigTomlPath(directory);
    const existing = await readConfigToml(filePath);
    for (const key of Object.keys(valueToRemove)) {
      delete existing[key];
    }
    await writeConfigToml(filePath, existing);
  }
}
