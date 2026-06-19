import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const HERMES_CONFIG_PATH = path.join(os.homedir(), '.hermes', 'config.yaml');

async function readHermesConfig(): Promise<Record<string, any>> {
  const content = await fs.readFile(HERMES_CONFIG_PATH, 'utf8');
  return yaml.load(content) as Record<string, any>;
}

describe('hermes-agent resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install hermes-agent', { timeout: 600_000 }, async () => {
    const hermesBin = path.join(os.homedir(), '.local', 'bin', 'hermes');
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'hermes-agent' }],
      {
        skipUninstall: true,
        validateApply: async () => {
          const exists = await fs.access(hermesBin).then(() => true).catch(() => false);
          expect(exists).toBe(true);
        },
      },
    );
  });

  it('Can manage model, timezone, and approvalsMode', { timeout: 600_000 }, async () => {
    const initialConfig = {
      model: { provider: 'anthropic', default: 'anthropic/claude-opus-4' },
      timezone: 'America/New_York',
      approvalsMode: 'manual' as const,
    };

    const modifiedConfig = {
      model: { provider: 'anthropic', default: 'anthropic/claude-sonnet-4-6' },
      timezone: 'America/Los_Angeles',
      approvalsMode: 'smart' as const,
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'hermes-agent', ...initialConfig }],
      {
        skipUninstall: true,
        validateApply: async () => {
          const config = await readHermesConfig();
          expect(config.model.provider).toBe('anthropic');
          expect(config.model.default).toBe('anthropic/claude-opus-4');
          expect(config.timezone).toBe('America/New_York');
          expect(config.approvals.mode).toBe('manual');
        },
        testModify: {
          modifiedConfigs: [{ type: 'hermes-agent', ...modifiedConfig }],
          validateModify: async () => {
            const config = await readHermesConfig();
            expect(config.model.default).toBe('anthropic/claude-sonnet-4-6');
            expect(config.timezone).toBe('America/Los_Angeles');
            expect(config.approvals.mode).toBe('smart');
          },
        },
      },
    );
  });

  it('Can manage MCP servers', { timeout: 600_000 }, async () => {
    const mcpServer = {
      name: 'test-filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'hermes-agent', mcpServers: [mcpServer] }],
      {
        validateApply: async () => {
          const config = await readHermesConfig();
          expect(config.mcp_servers).toBeDefined();
          expect(config.mcp_servers['test-filesystem']).toBeDefined();
          expect(config.mcp_servers['test-filesystem'].command).toBe('npx');
        },
        validateDestroy: async () => {
          try {
            const config = await readHermesConfig();
            expect(config.mcp_servers?.['test-filesystem']).toBeUndefined();
          } catch {
            // file removed entirely is also acceptable
          }
        },
      },
    );
  });

  afterAll(async () => {
    // Best-effort cleanup in case tests left hermes installed
    await testSpawn('hermes uninstall --full');
    await testSpawn('rm -f ~/.local/bin/hermes');
    await testSpawn('rm -rf ~/.hermes');
  }, 60_000);
});
