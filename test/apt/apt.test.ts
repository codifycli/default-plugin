import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Apt resource integration tests', { skip: !Utils.isLinux() }, () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall apt packages', { timeout: 300000 }, async () => {

    // Plans correctly and detects that apt is available
    await PluginTester.fullTest(pluginPath, [{
      type: 'apt',
      install: [
        'redis',
        'redis-tools'
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which redis-cli')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which apt-get')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      testModify: {
        modifiedConfigs: [{
          type: 'apt',
          install: [
            'tilix'
          ],
        }],
        validateModify: async () => {
          expect(await testSpawn('which tilix')).toMatchObject({ status: SpawnStatus.SUCCESS });
        }
      }
    });

    try {
      await PluginTester.uninstall(pluginPath, [{
        type: 'apt',
        install: [
          'redis',
          'redis-tools',
          'tilix'
        ]
      }]);
    } catch (e) {
      console.error(e);
    }
  });

  it('Can install packages with specific versions', { timeout: 300000 }, async () => {
    // Use the currently installed version (or latest available if not installed) to test version-pinned syntax
    const { data: installedVer } = await testSpawn('dpkg-query -W -f=\'${Version}\' curl 2>/dev/null || true');
    const { data: availableVer } = await testSpawn('apt-cache madison curl | head -1 | awk \'{print $3}\'');
    const pinnedVersion = installedVer.trim() || availableVer.trim();

    await PluginTester.fullTest(pluginPath, [{
      type: 'apt',
      install: [
        `curl=${pinnedVersion}`
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
        const { data: actualVersion } = await testSpawn('dpkg-query -W -f=\'${Version}\' curl');
        expect(actualVersion).toBe(pinnedVersion);
      },
    });
  });

  it('Can skip apt-get update when update is false', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'apt',
      install: ['curl'],
      update: true
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
    });
  });
});
