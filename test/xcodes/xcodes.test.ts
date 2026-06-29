import { SpawnStatus, Utils } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';

const pluginPath = path.resolve('./src/index.ts');

describe('xcodes resource integration tests', { skip: !Utils.isMacOS() || process.env.CI }, async () => {
  it('Installs xcodes', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'xcodes',
      }
    ], {
      validateApply: async () => {
        const xcodesCheck = await testSpawn('which xcodes');
        expect(xcodesCheck.status).toBe(SpawnStatus.SUCCESS);

        const versionCheck = await testSpawn('xcodes version');
        expect(versionCheck.status).toBe(SpawnStatus.SUCCESS);
      },
      validateDestroy: async () => {
        const xcodesCheck = await testSpawn('which xcodes');
        expect(xcodesCheck.status).toBe(SpawnStatus.ERROR);
      },
    });
  });
});
