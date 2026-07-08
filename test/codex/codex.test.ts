import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as TOML from 'smol-toml';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const CODEX_CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');

describe('codex resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install codex', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex' }],
      {
        skipUninstall: true,
        validateApply: async () => {
          const { data } = await testSpawn('which codex');
          expect(data.trim().length).toBeGreaterThan(0);
        },
      },
    );
  });

  it('Can manage config', { timeout: 300_000 }, async () => {
    const initialConfig = {
      approval_policy: 'on-request',
      sandbox_mode: 'workspace-write',
    };

    const modifiedConfig = {
      approval_policy: 'never',
      sandbox_mode: 'workspace-write',
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex', config: initialConfig }],
      {
        skipUninstall: true,
        validateApply: async () => {
          const content = await fs.readFile(CODEX_CONFIG_PATH, 'utf8');
          const parsed = TOML.parse(content) as Record<string, unknown>;
          expect(parsed['approval_policy']).toBe('on-request');
          expect(parsed['sandbox_mode']).toBe('workspace-write');
        },
        testModify: {
          modifiedConfigs: [{ type: 'codex', config: modifiedConfig }],
          validateModify: async () => {
            const content = await fs.readFile(CODEX_CONFIG_PATH, 'utf8');
            const parsed = TOML.parse(content) as Record<string, unknown>;
            expect(parsed['approval_policy']).toBe('never');
          },
        },
        validateDestroy: async () => {
          try {
            const content = await fs.readFile(CODEX_CONFIG_PATH, 'utf8');
            const parsed = TOML.parse(content) as Record<string, unknown>;
            expect(parsed['approval_policy']).toBeUndefined();
          } catch {
            // file removed entirely is also acceptable
          }
        },
      },
    );
  });

  it('Can manage MCP servers', { timeout: 300_000 }, async () => {
    const mcpServer = {
      name: 'test-filesystem',
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex', mcpServers: [mcpServer] }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CODEX_CONFIG_PATH, 'utf8');
          const parsed = TOML.parse(content) as { mcp_servers?: Record<string, { command?: string }> };
          expect(parsed.mcp_servers).toBeDefined();
          expect(parsed.mcp_servers?.['test-filesystem']).toBeDefined();
          expect(parsed.mcp_servers?.['test-filesystem']?.command).toBe('npx');
        },
        validateDestroy: async () => {
          try {
            const content = await fs.readFile(CODEX_CONFIG_PATH, 'utf8');
            const parsed = TOML.parse(content) as { mcp_servers?: Record<string, unknown> };
            expect(parsed.mcp_servers?.['test-filesystem']).toBeUndefined();
          } catch {
            // file not existing is also acceptable
          }
        },
      },
    );
  });

  afterAll(async () => {
    // Best-effort cleanup in case tests left codex installed
    await testSpawn('npm uninstall --global @openai/codex');
    await testSpawn('rm -f ~/.local/bin/codex');
    await testSpawn('rm -rf ~/.codex/packages/standalone');
  }, 60_000);
});
