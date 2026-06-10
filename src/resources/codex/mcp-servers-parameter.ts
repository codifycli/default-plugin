import { ArrayStatefulParameter, Plan } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';

import { readConfigToml, resolveConfigTomlPath, writeConfigToml } from './config-parameter.js';
import { CodexMcpServer, mcpServerToToml, tomlToMcpServer } from './mcp-server-schema.js';

export class CodexMcpServersParameter extends ArrayStatefulParameter<StringIndexedObject, CodexMcpServer> {
  override getSettings() {
    return {
      type: 'array' as const,
      isElementEqual: (a: CodexMcpServer, b: CodexMcpServer) => a.name === b.name,
    };
  }

  async refresh(_desired: CodexMcpServer[] | null, config: Partial<StringIndexedObject>): Promise<CodexMcpServer[] | null> {
    const filePath = resolveConfigTomlPath(config['directory'] as string | undefined);
    const data = await readConfigToml(filePath);
    const mcpServers = data['mcp_servers'];

    if (!mcpServers || typeof mcpServers !== 'object') {
      return [];
    }

    return Object.entries(mcpServers as Record<string, unknown>)
      .map(([name, serverConfig]) => tomlToMcpServer(name, serverConfig as Record<string, unknown>));
  }

  async addItem(item: CodexMcpServer, plan: Plan<StringIndexedObject>): Promise<void> {
    await this.mutateMcpServers((servers) => {
      servers[item.name] = mcpServerToToml(item);
    }, plan.desiredConfig?.['directory'] as string | undefined);
  }

  async removeItem(item: CodexMcpServer, plan: Plan<StringIndexedObject>): Promise<void> {
    const directory = (plan.currentConfig?.['directory'] ?? plan.desiredConfig?.['directory']) as string | undefined;
    await this.mutateMcpServers((servers) => {
      delete servers[item.name];
    }, directory);
  }

  private async mutateMcpServers(
    mutate: (servers: Record<string, unknown>) => void,
    directory?: string,
  ): Promise<void> {
    const filePath = resolveConfigTomlPath(directory);
    const data = await readConfigToml(filePath);

    if (!data['mcp_servers'] || typeof data['mcp_servers'] !== 'object') {
      data['mcp_servers'] = {};
    }

    mutate(data['mcp_servers'] as Record<string, unknown>);

    await writeConfigToml(filePath, data);
  }
}
