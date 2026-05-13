import { describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

// Currently need to figure out a way to test snap. It requires system ctl
describe('Snap resource integration tests', { skip: !Utils.isLinux() },  () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall snap packages', { timeout: 300000 }, async () => {

    // Plans correctly and detects that snap is available
    await PluginTester.fullTest(pluginPath, [{
      type: 'snap',
      install: [
        'hello-world',
        'curl',
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        const snapList = (await testSpawn('snap list')).data;
        expect(snapList).toContain('hello-world');
        expect(snapList).toContain('curl');
        expect(await testSpawn('which snap')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      testModify: {
        modifiedConfigs: [{
          type: 'snap',
          install: [
            'hello-world',
            'jq',
          ],
        }],
        validateModify: async () => {
          const snapList = (await testSpawn('snap list')).data;
          expect(snapList).toContain('hello-world');
          expect(snapList).toContain('jq');
        }
      }
    });

    await testSpawn('snap remove jq hello-world curl', { requiresRoot: true });
  });

  it('Can install packages with specific channels', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'snap',
      install: [
        { name: 'hello-world', channel: 'stable' }
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        const snapList = (await testSpawn('snap list')).data;
        expect(snapList).toContain('hello-world');
      },
    });
  });

  it('Can install classic snaps', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'snap',
      install: [
        { name: 'vault', classic: true }
      ]
    }], {
      validateApply: async () => {
        const snapList = (await testSpawn('snap list')).data;
        expect(snapList).toContain('vault');
      },
    });

    await PluginTester.install(pluginPath, [{
      type: 'snap',
    }])
  });
});
