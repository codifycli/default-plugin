import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Git lfs integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install git-lfs', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'git-lfs' }
    ], {
      validateDestroy: async () => {
        expect(await testSpawn('which git lfs')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  })
})
