import { PluginTester } from '@codifycli/plugin-test';
import * as TOML from 'smol-toml';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DIR = path.join(os.tmpdir(), 'codify-codex-project-test');
const AGENTS_MD_PATH = path.join(TEST_DIR, 'AGENTS.md');
const CONFIG_TOML_PATH = path.join(TEST_DIR, '.codex', 'config.toml');

describe('codex-project resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('Can manage agentsMd for a project directory', { timeout: 120_000 }, async () => {
    const initialContent = '# Project Instructions\n\nAlways write tests.';
    const modifiedContent = '# Project Instructions\n\nAlways write tests.\nPrefer TypeScript.';

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex-project', directory: TEST_DIR, agentsMd: initialContent }],
      {
        validateApply: async () => {
          const content = await fs.readFile(AGENTS_MD_PATH, 'utf8');
          expect(content).toBe(initialContent);
        },
        testModify: {
          modifiedConfigs: [{ type: 'codex-project', directory: TEST_DIR, agentsMd: modifiedContent }],
          validateModify: async () => {
            const content = await fs.readFile(AGENTS_MD_PATH, 'utf8');
            expect(content).toBe(modifiedContent);
          },
        },
        validateDestroy: async () => {
          const exists = await fs.access(AGENTS_MD_PATH).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        },
      },
    );
  });

  it('Can manage per-project config', { timeout: 120_000 }, async () => {
    const initialConfig = {
      approval_policy: 'on-request',
    };

    const modifiedConfig = {
      approval_policy: 'never',
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex-project', directory: TEST_DIR, config: initialConfig }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CONFIG_TOML_PATH, 'utf8');
          const parsed = TOML.parse(content) as Record<string, unknown>;
          expect(parsed['approval_policy']).toBe('on-request');
        },
        testModify: {
          modifiedConfigs: [{ type: 'codex-project', directory: TEST_DIR, config: modifiedConfig }],
          validateModify: async () => {
            const content = await fs.readFile(CONFIG_TOML_PATH, 'utf8');
            const parsed = TOML.parse(content) as Record<string, unknown>;
            expect(parsed['approval_policy']).toBe('never');
          },
        },
        validateDestroy: async () => {
          const exists = await fs.access(CONFIG_TOML_PATH).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        },
      },
    );
  });

  it('Can manage per-project MCP servers', { timeout: 120_000 }, async () => {
    const mcpServer = {
      name: 'test-filesystem',
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex-project', directory: TEST_DIR, mcpServers: [mcpServer] }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CONFIG_TOML_PATH, 'utf8');
          const parsed = TOML.parse(content) as { mcp_servers?: Record<string, { command?: string }> };
          expect(parsed.mcp_servers).toBeDefined();
          expect(parsed.mcp_servers?.['test-filesystem']).toBeDefined();
          expect(parsed.mcp_servers?.['test-filesystem']?.command).toBe('npx');
        },
        validateDestroy: async () => {
          const exists = await fs.access(CONFIG_TOML_PATH).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        },
      },
    );
  });

  it('Does not affect global config when managing per-project config', { timeout: 120_000 }, async () => {
    const globalConfigPath = path.join(os.homedir(), '.codex', 'config.toml');

    let globalConfigBefore: string | null = null;
    try {
      globalConfigBefore = await fs.readFile(globalConfigPath, 'utf8');
    } catch { /* may not exist */ }

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex-project', directory: TEST_DIR, config: { approval_policy: 'never' } }],
      {
        validateApply: async () => {
          // Per-project config written
          const content = await fs.readFile(CONFIG_TOML_PATH, 'utf8');
          expect((TOML.parse(content) as Record<string, unknown>)['approval_policy']).toBe('never');

          // Global config unchanged
          try {
            const globalContent = await fs.readFile(globalConfigPath, 'utf8');
            expect(globalContent).toBe(globalConfigBefore);
          } catch {
            expect(globalConfigBefore).toBeNull();
          }
        },
        validateDestroy: async () => {
          // Global config still unchanged after destroy
          try {
            const globalContent = await fs.readFile(globalConfigPath, 'utf8');
            expect(globalContent).toBe(globalConfigBefore);
          } catch {
            expect(globalConfigBefore).toBeNull();
          }
        },
      },
    );
  });
});
