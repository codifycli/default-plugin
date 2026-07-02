import { PluginTester } from '@codifycli/plugin-test';
import { Utils } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CODEX_APP_PATH = '/Applications/Codex.app';

describe('codex-app resource integration tests', { skip: !Utils.isMacOS() }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install the Codex desktop app', { timeout: 600_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'codex-app' }],
      {
        validateApply: async () => {
          const lstat = await fs.lstat(CODEX_APP_PATH);
          expect(lstat.isDirectory()).toBe(true);
        },
        validateDestroy: async () => {
          const exists = await fs.access(CODEX_APP_PATH).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        },
      },
    );
  });
});
