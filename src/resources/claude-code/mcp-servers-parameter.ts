import { ArrayStatefulParameter, Plan } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { ClaudeCodeConfig, McpServer } from './claude-code.js';

const CLAUDE_GLOBAL_CONFIG = path.join(os.homedir(), '.claude.json');

export class McpServersParameter extends ArrayStatefulParameter<ClaudeCodeConfig, McpServer> {
  override getSettings() {
    return {
      type: 'array' as const,
      isElementEqual: (a: McpServer, b: McpServer) => a.name === b.name,
    };
  }

  async refresh(_desired: McpServer[] | null): Promise<McpServer[] | null> {
    try {
      const content = await fs.readFile(CLAUDE_GLOBAL_CONFIG, 'utf8');
      const config = JSON.parse(content) as { mcpServers?: Record<string, unknown> };

      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        return [];
      }

      return Object.entries(config.mcpServers).map(([name, serverConfig]) => ({
        name,
        ...(serverConfig as object),
      })) as McpServer[];
    } catch {
      return [];
    }
  }

  async addItem(item: McpServer, _plan: Plan<ClaudeCodeConfig>): Promise<void> {
    const { name, ...serverConfig } = item;
    await this.mutateMcpServers((servers) => {
      servers[name] = serverConfig;
    });
  }

  async removeItem(item: McpServer, _plan: Plan<ClaudeCodeConfig>): Promise<void> {
    await this.mutateMcpServers((servers) => {
      delete servers[item.name];
    });
  }

  private async mutateMcpServers(
    mutate: (servers: Record<string, unknown>) => void,
  ): Promise<void> {
    let config: Record<string, unknown> = {};
    try {
      const content = await fs.readFile(CLAUDE_GLOBAL_CONFIG, 'utf8');
      config = JSON.parse(content) as Record<string, unknown>;
    } catch { /* file may not exist yet */ }

    if (!config['mcpServers'] || typeof config['mcpServers'] !== 'object') {
      config['mcpServers'] = {};
    }

    mutate(config['mcpServers'] as Record<string, unknown>);

    await fs.writeFile(CLAUDE_GLOBAL_CONFIG, JSON.stringify(config, null, 2), 'utf8');
  }
}
