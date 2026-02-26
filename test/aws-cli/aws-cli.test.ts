import { beforeEach, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import cp from 'child_process';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Test aws-cli', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install aws-cli', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'aws-cli' },
    ], {
      // skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which aws')).toMatchObject({ status: SpawnStatus.SUCCESS });

      },
      validateDestroy: async () => {
        expect(await testSpawn('which aws')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })
})
