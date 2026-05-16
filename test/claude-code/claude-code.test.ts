import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const CLAUDE_MD_PATH = path.join(os.homedir(), '.claude', 'CLAUDE.md');
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const CLAUDE_GLOBAL_CONFIG = path.join(os.homedir(), '.claude.json');

describe('claude-code resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install claude-code', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'claude-code' }],
      {
        validateApply: async () => {
          expect(await testSpawn('which claude')).toMatchObject({ status: SpawnStatus.SUCCESS });
        },
        validateDestroy: async () => {
          expect(await testSpawn('which claude')).toMatchObject({ status: SpawnStatus.ERROR });
        },
      },
    );
  });

  it('Can manage settings', { timeout: 300_000 }, async () => {
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
      [{ type: 'claude-code', settings: initialSettings }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf8');
          const parsed = JSON.parse(content);
          expect(parsed.editorMode).toBe('vim');
          expect(parsed.spinnerTipsEnabled).toBe(false);
        },
        testModify: {
          modifiedConfigs: [{ type: 'claude-code', settings: modifiedSettings }],
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

  it('Can manage globalClaudeMd', { timeout: 300_000 }, async () => {
    const initialContent = '# Global Instructions\n\nAlways write tests.';
    const modifiedContent = '# Global Instructions\n\nAlways write tests.\nPrefer TypeScript.';

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'claude-code', globalClaudeMd: initialContent }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CLAUDE_MD_PATH, 'utf8');
          expect(content).toBe(initialContent);
        },
        testModify: {
          modifiedConfigs: [{ type: 'claude-code', globalClaudeMd: modifiedContent }],
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

  it('Can manage MCP servers', { timeout: 300_000 }, async () => {
    const mcpServer = {
      name: 'test-filesystem',
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'claude-code', mcpServers: [mcpServer] }],
      {
        validateApply: async () => {
          const content = await fs.readFile(CLAUDE_GLOBAL_CONFIG, 'utf8');
          const config = JSON.parse(content);
          expect(config.mcpServers).toBeDefined();
          expect(config.mcpServers['test-filesystem']).toBeDefined();
          expect(config.mcpServers['test-filesystem'].command).toBe('npx');
        },
        validateDestroy: async () => {
          try {
            const content = await fs.readFile(CLAUDE_GLOBAL_CONFIG, 'utf8');
            const config = JSON.parse(content);
            expect(config.mcpServers?.['test-filesystem']).toBeUndefined();
          } catch {
            // file not existing is also acceptable
          }
        },
      },
    );
  });

  afterAll(async () => {
    // Best-effort cleanup in case tests left claude installed
    await testSpawn('claude --uninstall --force');
    await testSpawn('rm -f ~/.local/bin/claude');
  }, 60_000);
});
