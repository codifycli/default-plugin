import { ArrayStatefulParameter, Plan } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';

import { mutateHermesConfig, readHermesConfig } from './hermes-agent-config.js';
import { McpServer } from './hermes-agent.js';

export class McpServersParameter extends ArrayStatefulParameter<StringIndexedObject, McpServer> {
  override getSettings() {
    return {
      type: 'array' as const,
      isElementEqual: (a: McpServer, b: McpServer) => a.name === b.name,
    };
  }

  async refresh(_desired: McpServer[] | null): Promise<McpServer[] | null> {
    const config = await readHermesConfig();
    const mcpServers = config['mcp_servers'];

    if (!mcpServers || typeof mcpServers !== 'object') {
      return [];
    }

    return Object.entries(mcpServers as Record<string, unknown>).map(([name, serverConfig]) => ({
      name,
      ...(serverConfig as object),
    })) as McpServer[];
  }

  async addItem(item: McpServer, _plan: Plan<StringIndexedObject>): Promise<void> {
    const { name, ...serverConfig } = item;
    await mutateHermesConfig((config) => {
      const mcpServers = (config['mcp_servers'] ??= {}) as Record<string, unknown>;
      mcpServers[name] = serverConfig;
    });
  }

  async removeItem(item: McpServer, _plan: Plan<StringIndexedObject>): Promise<void> {
    await mutateHermesConfig((config) => {
      const mcpServers = config['mcp_servers'];
      if (mcpServers && typeof mcpServers === 'object') {
        delete (mcpServers as Record<string, unknown>)[item.name];
      }
    });
  }
}
