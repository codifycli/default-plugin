import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Homebrew taps tests', { skip: !Utils.isMacOS() }, () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install homebrew and add a tap', { timeout: 300000 }, async () => {
    // Plans correctly and detects that brew is not installed
    await PluginTester.fullTest(pluginPath, [{
      type: 'homebrew',
      taps: ['cirruslabs/cli'],
    }], {
      validateApply: async () => {
        expect(await testSpawn('brew tap')).toMatchObject({ data: expect.stringContaining('cirruslabs/cli') });
      },
      testModify: {
        modifiedConfigs: [{
          type: 'homebrew',
          taps: ['hashicorp/tap'],
        }],
        validateModify: async () => {
          const taps = (await testSpawn('brew tap')).data;
          expect(taps).toContain('cirruslabs/cli');
          expect(taps).toContain('hashicorp/tap');
        },
      },
      validateDestroy: async () => {
        expect(await testSpawn('which brew')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });
})
