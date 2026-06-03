import { PluginTester } from '@codifycli/plugin-test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DIR = path.join(os.tmpdir(), 'codify-claude-code-project-test');
const CLAUDE_MD_PATH = path.join(TEST_DIR, '.claude', 'CLAUDE.md');
const CLAUDE_SETTINGS_PATH = path.join(TEST_DIR, '.claude', 'settings.json');
const CLAUDE_JSON_PATH = path.join(TEST_DIR, '.claude.json');

describe('claude-code-project resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('Can manage claudeMd for a project directory', { timeout: 120_000 }, async () => {
    const initialContent = '# Project Instructions\n\nAlways write tests.';
    const modifiedContent = '# Project Instructions\n\nAlways write tests.\nPrefer TypeScript.';

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'claude-code-project', directory: TEST_DIR, claudeMd: initialContent }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CLAUDE_MD_PATH, 'utf8');
          expect(content).toBe(initialContent);
        },
        testModify: {
          modifiedConfigs: [{ type: 'claude-code-project', directory: TEST_DIR, claudeMd: modifiedContent }],
          validateModify: async () => {
            const content = await fs.readFile(CLAUDE_MD_PATH, 'utf8');
            expect(content).toBe(modifiedContent);
          },
        },
        validateDestroy: async () => {
          const exists = await fs.access(CLAUDE_MD_PATH).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        },
      },
    );
  });

  it('Can manage per-project settings', { timeout: 120_000 }, async () => {
    const initialSettings = {
      editorMode: 'vim',
      spinnerTipsEnabled: false,
    };

    const modifiedSettings = {
      editorMode: 'normal',
      spinnerTipsEnabled: false,
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'claude-code-project', directory: TEST_DIR, settings: initialSettings }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf8');
          const parsed = JSON.parse(content);
          expect(parsed.editorMode).toBe('vim');
          expect(parsed.spinnerTipsEnabled).toBe(false);
        },
        testModify: {
          modifiedConfigs: [{ type: 'claude-code-project', directory: TEST_DIR, settings: modifiedSettings }],
          validateModify: async () => {
            const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf8');
            const parsed = JSON.parse(content);
            expect(parsed.editorMode).toBe('normal');
          },
        },
        validateDestroy: async () => {
          try {
            const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf8');
            const parsed = JSON.parse(content);
            expect(parsed.editorMode).toBeUndefined();
          } catch {
            // file removed entirely is also acceptable
          }
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
      [{ type: 'claude-code-project', directory: TEST_DIR, mcpServers: [mcpServer] }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf8');
          const config = JSON.parse(content);
          expect(config.mcpServers).toBeDefined();
          expect(config.mcpServers['test-filesystem']).toBeDefined();
          expect(config.mcpServers['test-filesystem'].command).toBe('npx');
        },
        validateDestroy: async () => {
          try {
            const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf8');
            const config = JSON.parse(content);
            expect(config.mcpServers?.['test-filesystem']).toBeUndefined();
          } catch {
            // file not existing is also acceptable
          }
        },
      },
    );
  });

  it('Does not affect global settings when managing per-project settings', { timeout: 120_000 }, async () => {
    const globalSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');

    let globalSettingsBefore: string | null = null;
    try {
      globalSettingsBefore = await fs.readFile(globalSettingsPath, 'utf8');
    } catch { /* may not exist */ }

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'claude-code-project', directory: TEST_DIR, settings: { editorMode: 'vim' } }],
      {
        validateApply: async () => {
          // Per-project settings written
          const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf8');
          expect(JSON.parse(content).editorMode).toBe('vim');

          // Global settings unchanged
          try {
            const globalContent = await fs.readFile(globalSettingsPath, 'utf8');
            expect(globalContent).toBe(globalSettingsBefore);
          } catch {
            expect(globalSettingsBefore).toBeNull();
          }
        },
        validateDestroy: async () => {
          // Global settings still unchanged after destroy
          try {
            const globalContent = await fs.readFile(globalSettingsPath, 'utf8');
            expect(globalContent).toBe(globalSettingsBefore);
          } catch {
            expect(globalSettingsBefore).toBeNull();
          }
        },
      },
    );
  });
});
