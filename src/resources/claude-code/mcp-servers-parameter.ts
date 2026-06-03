import { ArrayStatefulParameter, Plan } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { untildify } from '../../utils/untildify.js';
import { McpServer } from './claude-code.js';

export function resolveClaudeJsonPath(directory?: string): string {
  if (directory) return path.join(untildify(directory), '.claude.json');
  return path.join(os.homedir(), '.claude.json');
}

export class McpServersParameter extends ArrayStatefulParameter<StringIndexedObject, McpServer> {
  override getSettings() {
    return {
      type: 'array' as const,
      isElementEqual: (a: McpServer, b: McpServer) => a.name === b.name,
    };
  }

  async refresh(_desired: McpServer[] | null, config: Partial<StringIndexedObject>): Promise<McpServer[] | null> {
    const configPath = resolveClaudeJsonPath(config['directory'] as string | undefined);
    try {
      const content = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> };

      if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
        return [];
      }

      return Object.entries(parsed.mcpServers).map(([name, serverConfig]) => ({
        name,
        ...(serverConfig as object),
      })) as McpServer[];
    } catch {
      return [];
    }
  }

  async addItem(item: McpServer, plan: Plan<StringIndexedObject>): Promise<void> {
    const { name, ...serverConfig } = item;
    await this.mutateMcpServers((servers) => {
      servers[name] = serverConfig;
    }, plan.desiredConfig?.['directory'] as string | undefined);
  }

  async removeItem(item: McpServer, plan: Plan<StringIndexedObject>): Promise<void> {
    const directory = (plan.currentConfig?.['directory'] ?? plan.desiredConfig?.['directory']) as string | undefined;
    await this.mutateMcpServers((servers) => {
      delete servers[item.name];
    }, directory);
  }

  private async mutateMcpServers(
    mutate: (servers: Record<string, unknown>) => void,
    directory?: string,
  ): Promise<void> {
    const configPath = resolveClaudeJsonPath(directory);
    let config: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(content) as Record<string, unknown>;
    } catch { /* file may not exist yet */ }

    if (!config['mcpServers'] || typeof config['mcpServers'] !== 'object') {
      config['mcpServers'] = {};
    }

    mutate(config['mcpServers'] as Record<string, unknown>);

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  }
}
