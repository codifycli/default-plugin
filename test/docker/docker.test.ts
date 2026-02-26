import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Test docker', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install docker', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'docker' },
    ], {
      validateApply: async () => {
        expect(await testSpawn('which docker')).toMatchObject({ status: SpawnStatus.SUCCESS });

      },
      validateDestroy: async () => {
        expect(await testSpawn('which docker')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })
})
