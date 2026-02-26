import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from 'codify-plugin-test';
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
        { name: 'redis-tools' }
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
            'vlc',
            { name: 'tilix' }
          ],
        }],
        validateModify: async () => {
          expect(await testSpawn('which vlc')).toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(await testSpawn('which tilix')).toMatchObject({ status: SpawnStatus.SUCCESS });
        }
      }
    });

    try {
      await PluginTester.uninstall(pluginPath, [{
        type: 'apt',
        install: [
          'redis',
          { name: 'redis-tools' },
          'vlc',
          { name: 'tilix' }
        ]
      }]);
    } catch (e) {
      console.error(e);
    }
  });

  it('Can install packages with specific versions', { timeout: 300000 }, async () => {
    // Get available version of a package
    const { data: availableVersions } = await testSpawn('apt-cache madison curl | head -1 | awk \'{print $3}\'');

    await PluginTester.fullTest(pluginPath, [{
      type: 'apt',
      install: [
        { name: 'curl', version: availableVersions }
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
        const { data: installedVersion } = await testSpawn('dpkg-query -W -f=\'${Version}\' curl');
        expect(installedVersion).toBe(availableVersions);
      },
    });
  });

  it('Can skip apt-get update when update is false', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'apt',
      install: ['curl'],
      update: false
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
    });

    try {
      await PluginTester.uninstall(pluginPath, [{
        type: 'apt',
        install: ['curl'],
        update: false
      }]);
    } catch (e) {
      console.error(e);
    }
  });
});
