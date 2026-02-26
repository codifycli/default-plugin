import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Macports resource integration tests', { skip: !Utils.isMacOS() }, () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall macports', { timeout: 800_000 }, async () => {
    // Plans correctly and detects that brew is not installed
    await PluginTester.fullTest(pluginPath, [{
      type: 'macports',
      install: [
        { name: 'libelf', version: '@0.8.13_4' },
        'aom'
      ]
    }], {
      validateApply: async () => {
        expect(await testSpawn('which port')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
    });
  });
})
