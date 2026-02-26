import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Dnf resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall dnf packages', { timeout: 300000 }, async () => {
    if (!TestUtils.isLinux()) {
      console.log('Skipping dnf test - not running on Linux');
      return;
    }

    if ((await testSpawn('which dnf')).status !== SpawnStatus.SUCCESS) {
      console.log('Skipping dnf test - dnf not available on this system');
      return;
    }

    // Plans correctly and detects that dnf is available
    await PluginTester.fullTest(pluginPath, [{
      type: 'dnf',
      install: [
        'curl',
        'wget',
        'vim-enhanced',
      ]
    }], {
      skipUninstall: true,
      validateApply: () => {
        expect(testSpawn('which curl')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(testSpawn('which wget')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(testSpawn('which vim')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(testSpawn('which dnf')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      testModify: {
        modifiedConfigs: [{
          type: 'dnf',
          install: [
            'curl',
            'git'
          ],
        }],
        validateModify: () => {
          expect(testSpawn('which curl')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(testSpawn('which git')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
          // wget and vim should be removed
          expect(testSpawn('which wget')).resolves.toMatchObject({ status: SpawnStatus.ERROR });
          expect(testSpawn('which vim')).resolves.toMatchObject({ status: SpawnStatus.ERROR });
        }
      },
      validateDestroy: () => {
        // dnf should still exist as it's a core system component
        expect(testSpawn('which dnf')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
      }
    });
  });

  it('Can install packages with specific versions', { timeout: 300000, skip: true }, async () => {
    if (!TestUtils.isLinux()) {
      console.log('Skipping dnf test - not running on Linux');
      return;
    }

    // Check if dnf is available
    if ((await testSpawn('which dnf')).status !== SpawnStatus.SUCCESS) {
      console.log('Skipping dnf test - dnf not available on this system');
      return;
    }

    // Get available version of a package
    const { data: availableVersions } = await testSpawn('dnf list available curl | tail -1 | awk \'{print $2}\'')

    await PluginTester.fullTest(pluginPath, [{
      type: 'dnf',
      install: [
        { name: 'curl', version: availableVersions }
      ]
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which curl')).toMatchObject({ status: SpawnStatus.SUCCESS });
        const installedVersion = (await testSpawn('rpm -q --queryformat \'%{VERSION}-%{RELEASE}\' curl')).data;
        expect(installedVersion).toBe(availableVersions);
      },
    });
  });

  it('Can skip dnf check-update when update is false', { timeout: 300000 }, async () => {
    if (!TestUtils.isLinux()) {
      console.log('Skipping dnf test - not running on Linux');
      return;
    }

    // Check if dnf is available
    if ((await testSpawn('which dnf')).status !== SpawnStatus.SUCCESS) {
      console.log('Skipping dnf test - dnf not available on this system');
      return;
    }

    await PluginTester.fullTest(pluginPath, [{
      type: 'dnf',
      install: ['curl'],
      update: false
    }], {
      skipUninstall: true,
      validateApply: () => {
        expect(testSpawn('which curl')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
      },
    });
  });
});
