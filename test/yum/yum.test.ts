import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Yum resource integration tests', { skip: !Utils.isLinux() }, () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall yum packages', { timeout: 300000 }, async () => {
    if (!TestUtils.isLinux()) {
      console.log('Skipping yum test - not running on Linux');
      return;
    }

    // Check if yum is available
    if ((await testSpawn('which yum')).status !== SpawnStatus.SUCCESS) {
      console.log('Skipping yum test - yum not available on this system');
      return;
    }

    // Plans correctly and detects that yum is available
    await PluginTester.fullTest(pluginPath, [{
      type: 'yum',
      install: [
        'curl',
        'wget',
        'vim-enhanced',
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which wget')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which vim')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which yum')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      testModify: {
        modifiedConfigs: [{
          type: 'yum',
          install: [
            'curl',
            'git'
          ],
        }],
        validateModify: async () => {
          expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(await testSpawn('which git')).toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(await testSpawn('which htop')).toMatchObject({ status: SpawnStatus.SUCCESS });
          // wget and vim should be removed
          expect(await testSpawn('which wget')).toMatchObject({ status: SpawnStatus.ERROR });
          expect(await testSpawn('which vim')).toMatchObject({ status: SpawnStatus.ERROR });
        }
      },
      validateDestroy: async () => {
        // yum should still exist as it's a core system component
        expect(await testSpawn('which yum')).toMatchObject({ status: SpawnStatus.SUCCESS });
      }
    });
  });

  it('Can install packages with specific versions', { timeout: 300000, skip: true }, async () => {
    if (!TestUtils.isLinux()) {
      console.log('Skipping yum test - not running on Linux');
      return;
    }

    // Check if yum is available
    if ((await testSpawn('which yum')).status !== SpawnStatus.SUCCESS) {
      console.log('Skipping yum test - yum not available on this system');
      return;
    }

    // Get available version of a package
    const { data: availableVersions } = await testSpawn('yum list available curl | tail -1 | awk \'{print $2}\'')

    await PluginTester.fullTest(pluginPath, [{
      type: 'yum',
      install: [
        { name: 'curl', version: availableVersions }
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
        const installedVersion = (await testSpawn('rpm -q --queryformat \'%{VERSION}-%{RELEASE}\' curl')).data
        expect(installedVersion).toBe(availableVersions);
      },
    });
  });

  it('Can skip yum check-update when update is false', { timeout: 300000 }, async () => {
    if (!TestUtils.isLinux()) {
      console.log('Skipping yum test - not running on Linux');
      return;
    }

    // Check if yum is available
    if ((await testSpawn('which yum')).status !== SpawnStatus.SUCCESS) {
      console.log('Skipping yum test - yum not available on this system');
      return;
    }

    await PluginTester.fullTest(pluginPath, [{
      type: 'yum',
      install: ['curl'],
      update: false
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
    });
  });
});
