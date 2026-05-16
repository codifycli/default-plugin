import { ArrayStatefulParameter, getPty, Plan, SpawnStatus, Utils } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { WebStormConfig } from './webstorm.js';

export const MACOS_APP_PATH = '/Applications/WebStorm.app';
export const MACOS_BINARY = `${MACOS_APP_PATH}/Contents/MacOS/webstorm`;

export function getWebStormBinary(): string {
  return Utils.isMacOS() ? MACOS_BINARY : 'webstorm';
}

export async function findConfigDir(): Promise<string | null> {
  const parentDir = Utils.isMacOS()
    ? path.join(os.homedir(), 'Library', 'Application Support', 'JetBrains')
    : path.join(os.homedir(), '.config', 'JetBrains');

  try {
    const entries = await fs.readdir(parentDir);
    const dirs = entries.filter((e) => e.startsWith('WebStorm')).sort();
    return dirs.length > 0 ? path.join(parentDir, dirs[dirs.length - 1]) : null;
  } catch {
    return null;
  }
}

export async function getOrCreateConfigDir(): Promise<string | null> {
  const existing = await findConfigDir();
  if (existing) return existing;

  const version = await getWebStormMajorMinorVersion();
  if (!version) return null;

  const parentDir = Utils.isMacOS()
    ? path.join(os.homedir(), 'Library', 'Application Support', 'JetBrains')
    : path.join(os.homedir(), '.config', 'JetBrains');

  const configDir = path.join(parentDir, `WebStorm${version}`);
  await fs.mkdir(configDir, { recursive: true });
  return configDir;
}

async function getWebStormMajorMinorVersion(): Promise<string | null> {
  const $ = getPty();

  if (Utils.isMacOS()) {
    const result = await $.spawnSafe(
      `/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "${MACOS_APP_PATH}/Contents/Info.plist"`
    );
    if (result.status !== SpawnStatus.SUCCESS) return null;
    const parts = result.data.trim().split('.');
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
  }

  if (Utils.isLinux()) {
    const result = await $.spawnSafe('snap list webstorm');
    if (result.status !== SpawnStatus.SUCCESS) return null;
    const lines = result.data.split('\n');
    const line = lines.find((l) => l.startsWith('webstorm'));
    const match = line?.match(/(\d+\.\d+)/);
    return match ? match[1] : null;
  }

  return null;
}

function getPluginsDir(configDir: string): string {
  // macOS: plugins are in a `plugins/` subdir of the config dir
  // Linux: plugins are in ~/.local/share/JetBrains/WebStorm<version>/ directly
  if (Utils.isMacOS()) {
    return path.join(configDir, 'plugins');
  }
  // For Linux, derive from config dir path by swapping .config → .local/share
  const version = path.basename(configDir);
  return path.join(os.homedir(), '.local', 'share', 'JetBrains', version);
}

async function readPluginIdFromDir(pluginDir: string): Promise<string | null> {
  const xmlPath = path.join(pluginDir, 'META-INF', 'plugin.xml');
  try {
    const content = await fs.readFile(xmlPath, 'utf8');
    const match = content.match(/<id>([^<]+)<\/id>/);
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

export class PluginsParameter extends ArrayStatefulParameter<WebStormConfig, string> {
  override getSettings() {
    return {
      type: 'array' as const,
      isElementEqual: (desired: string, current: string) =>
        desired.toLowerCase() === current.toLowerCase(),
    };
  }

  override async refresh(_desired: string[] | null): Promise<string[] | null> {
    const configDir = await findConfigDir();
    if (!configDir) return null;

    const pluginsDir = getPluginsDir(configDir);
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
      const ids: string[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = await readPluginIdFromDir(path.join(pluginsDir, entry.name));
        if (id) ids.push(id);
      }

      return ids;
    } catch {
      return [];
    }
  }

  async addItem(item: string, _plan: Plan<WebStormConfig>): Promise<void> {
    const $ = getPty();
    const binary = getWebStormBinary();
    await $.spawn(`"${binary}" installPlugins ${item}`, { interactive: true });
  }

  async removeItem(item: string, _plan: Plan<WebStormConfig>): Promise<void> {
    const configDir = await findConfigDir();
    if (!configDir) return;

    const pluginsDir = getPluginsDir(configDir);
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = await readPluginIdFromDir(path.join(pluginsDir, entry.name));
        if (id?.toLowerCase() === item.toLowerCase()) {
          await fs.rm(path.join(pluginsDir, entry.name), { recursive: true, force: true });
          return;
        }
      }
    } catch { /* plugin dir doesn't exist, nothing to remove */ }
  }
}
