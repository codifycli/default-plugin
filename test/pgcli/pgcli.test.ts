import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Pgcli integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install pgcli', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'pgcli' }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which pgcli')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('pgcli -v')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('which pgcli')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('pgcli -v')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })
})
