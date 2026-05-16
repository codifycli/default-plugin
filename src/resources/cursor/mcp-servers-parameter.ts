import { ParameterSetting, StatefulParameter } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CursorConfig, McpServers } from './cursor.js';

type McpFile = { mcpServers?: McpServers };

export class McpServersParameter extends StatefulParameter<CursorConfig, McpServers> {
  getSettings(): ParameterSetting {
    return { type: 'object' };
  }

  override async refresh(): Promise<McpServers | null> {
    try {
      const content = await fs.readFile(getMcpPath(), 'utf8');
      const parsed = JSON.parse(content) as McpFile;
      return parsed.mcpServers ?? null;
    } catch {
      return null;
    }
  }

  async add(valueToAdd: McpServers): Promise<void> {
    await writeMcpServers(valueToAdd);
  }

  async modify(newValue: McpServers, previousValue: McpServers): Promise<void> {
    const filePath = getMcpPath();
    let parsed: McpFile = {};
    try {
      parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch { /* file may not exist */ }

    const servers = parsed.mcpServers ?? {};

    // Remove servers no longer desired
    for (const key of Object.keys(previousValue)) {
      if (!(key in newValue)) {
        delete servers[key];
      }
    }

    // Apply new/changed servers
    Object.assign(servers, newValue);

    parsed.mcpServers = servers;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(parsed, null, 2));
  }

  async remove(valueToRemove: McpServers): Promise<void> {
    const filePath = getMcpPath();
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as McpFile;
      const servers = parsed.mcpServers ?? {};
      for (const key of Object.keys(valueToRemove)) {
        delete servers[key];
      }
      parsed.mcpServers = servers;
      await fs.writeFile(filePath, JSON.stringify(parsed, null, 2));
    } catch { /* nothing to do if file doesn't exist */ }
  }
}

function getMcpPath(): string {
  return path.join(os.homedir(), '.cursor', 'mcp.json');
}

async function writeMcpServers(servers: McpServers): Promise<void> {
  const filePath = getMcpPath();
  let parsed: McpFile = {};
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch { /* file may not exist yet */ }
  parsed.mcpServers = { ...(parsed.mcpServers ?? {}), ...servers };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(parsed, null, 2));
}
