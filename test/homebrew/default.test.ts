import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import fs from 'node:fs/promises';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Homebrew main resource integration tests', { skip: !Utils.isMacOS() }, () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Creates brew and can install formulas', { timeout: 300000 }, async () => {
    // Plans correctly and detects that brew is not installed
    await PluginTester.fullTest(pluginPath, [{
      type: 'homebrew',
      formulae: [
        'sshpass'
      ]
    }], {
      validateApply: async () => {
        expect(await testSpawn('which sshpass')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which brew')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      testModify: {
        modifiedConfigs: [{
          type: 'homebrew',
          formulae: [
            'sshpass',
            'hashicorp/tap/hcp', // Test that it can handle a fully qualified name (tap + name)
          ],
        }],
        validateModify: async () => {
          expect(await testSpawn('which sshpass')).toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(await testSpawn('which brew')).toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(await testSpawn('which hcp')).toMatchObject({ status: SpawnStatus.SUCCESS });
        }
      },
      validateDestroy: async () => {
        expect(await testSpawn('which libxau')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('which sshpass')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('which hcp')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('which brew')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });

  it('Can handle casks that were already installed by skipping in the plan', { timeout: 300000 }, async () => {
    if (!Utils.isMacOS()) {
      return;
    }

    // Install vscode outside of cask
    await PluginTester.fullTest(pluginPath, [{
      type: 'vscode',
    }, {
      type: 'homebrew'
    }], {
      skipUninstall: true,
      validateApply: async () => {
        console.log('Is macOS', Utils.isMacOS());

        if (Utils.isMacOS()) {
          const programPath = '/Applications/Visual Studio Code.app'
          const lstat = await fs.lstat(programPath);
          expect(lstat.isDirectory()).to.be.true;
        }
      }
    })

    // Without skipping vscode install this should throw
    await PluginTester.fullTest(pluginPath, [{
      type: 'homebrew',
      casks: ['visual-studio-code'],
    }], {
      validateApply: async (plans) => {
        // Even though vscode was not installed via brew, it'll return true so that Codify won't attempt to install it
        expect(plans[0]).toMatchObject({
          "operation": "noop",
          "resourceType": "homebrew",
          "parameters": [
            {
              "name": "casks",
              "isSensitive": false,
              "previousValue": [
                "visual-studio-code"
              ],
              "newValue": [
                "visual-studio-code"
              ],
              "operation": "noop"
            },
            {
              "name": "skipAlreadyInstalledCasks",
              "isSensitive": false,
              "previousValue": null,
              "newValue": true,
              "operation": "noop"
            },
            {
              "name": "onlyPlanUserInstalled",
              "isSensitive": false,
              "newValue": true,
              "operation": "noop",
              "previousValue": null,
            },
          ]
        })

        if (Utils.isMacOS()) {
          const programPath = '/Applications/Visual Studio Code.app'
          const lstat = await fs.lstat(programPath);
          expect(lstat.isDirectory()).to.be.true;
        }
      }, validateDestroy: async () => {
        if (Utils.isMacOS()) {
          const programPath = '/Applications/Visual Studio Code.app'
          const lstat = await fs.lstat(programPath);
          expect(lstat.isDirectory()).to.be.true;
        }
      }
    })

    await expect(async () => PluginTester.fullTest(pluginPath, [{
      type: 'homebrew',
      casks: ['visual-studio-code'],
      skipAlreadyInstalledCasks: false,
    }])).rejects.toThrowError();

    await PluginTester.uninstall(pluginPath, [{
      type: 'vscode',
    }, {
      type: 'homebrew',
    }])
  })

  it('Can handle casks that were already installed by skipping in the install (only applicable to the initial)', { timeout: 300000 }, async () => {
    if (!Utils.isMacOS()) {
      return;
    }

    // Install vscode outside of cask
    await PluginTester.fullTest(pluginPath, [{
      type: 'vscode',
    }, {
      type: 'homebrew',
      casks: ['visual-studio-code'],
      dependsOn: ['vscode']
    }], {
      validateApply: async (plans) => {
        expect(plans[0]).toMatchObject({
          "operation": "create",
          "resourceType": "vscode",
        })

        expect(plans[1]).toMatchObject({
          "operation": "create",
          "resourceType": "homebrew",
          "parameters": expect.arrayContaining([
            {
              "name": "casks",
              "isSensitive": false,
              "previousValue": null,
              "newValue": ["visual-studio-code"],
              "operation": "add"
            }
          ])
        })

        if (Utils.isMacOS()) {
          const programPath = '/Applications/Visual Studio Code.app'
          const lstat = await fs.lstat(programPath);
          expect(lstat.isDirectory()).to.be.true;
        }
      },
      validateDestroy: async () => {
        if (Utils.isMacOS()) {
          const programPath = '/Applications/Visual Studio Code.app'
          expect(async () => await fs.lstat(programPath)).to.throw;
        }
        expect((await fs.readFile(TestUtils.getPrimaryShellRc())).toString('utf-8')).to.not.include('homebrew')
      }
    })
  })
})
