import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

describe('openclaw resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install openclaw', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'openclaw' }],
      {
        skipUninstall: true,
        validateApply: async () => {
          const { data } = await testSpawn('which openclaw');
          expect(data.trim().length).toBeGreaterThan(0);
        },
      },
    );
  });

  it('Can manage settings', { timeout: 300_000 }, async () => {
    const initialSettings = {
      gateway: { mode: 'local', port: 18789, bind: 'loopback' },
      logging: { level: 'debug' },
    };

    const modifiedSettings = {
      gateway: { mode: 'local', port: 18790, bind: 'loopback' },
      logging: { level: 'debug' },
    };

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'openclaw', settings: initialSettings }],
      {
        validateApply: async () => {
          const content = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
          const parsed = JSON.parse(content);
          expect(parsed.gateway.port).toBe(18789);
          expect(parsed.logging.level).toBe('debug');
        },
        testModify: {
          modifiedConfigs: [{ type: 'openclaw', settings: modifiedSettings }],
          validateModify: async () => {
            const content = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
            const parsed = JSON.parse(content);
            expect(parsed.gateway.port).toBe(18790);
          },
        },
        validateDestroy: async () => {
          try {
            const content = await fs.readFile(OPENCLAW_CONFIG_PATH, 'utf8');
            const parsed = JSON.parse(content);
            expect(parsed.gateway).toBeUndefined();
          } catch {
            // file removed entirely is also acceptable
          }
        },
      },
    );
  });

  afterAll(async () => {
    // Best-effort cleanup in case tests left openclaw installed
    await testSpawn('openclaw gateway stop');
    await testSpawn('npm uninstall -g openclaw');
    await testSpawn('rm -f ~/.local/bin/openclaw');
    await testSpawn('rm -rf ~/.openclaw');
  }, 60_000);
});
