import { describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Pyenv resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs pyenv and python (this installs on a clean system without readline, openSSL, etc.)', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'pyenv',
        pythonVersions: ['3.11']
      }
    ], {
      skipUninstall: true,
      validateApply: () => {
        expect(testSpawn('which pyenv')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
      }
    });
  });

  it ('Can install additional python versions. (this installs after openSSL and readline have been installed)', { timeout: 700000 }, async () => {
    await PluginTester.install(pluginPath, [{
      type: 'homebrew',
      formulae: ['readline', 'openssl@3'],
      os: ['macOS'],
    }])

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'pyenv',
        pythonVersions: ['3.11', '3.12'],
        global: '3.12',
      }
    ], {
      validateApply: async () => {
        expect(testSpawn('python --version')).resolves.toMatchObject({ data: expect.stringContaining('3.12') });

        const { data: versions } = await testSpawn('pyenv versions')
        expect(versions).to.include('3.12')
        expect(versions).to.include('3.11')
      },
      validateDestroy: () => {
        expect(fs.existsSync(path.resolve(os.homedir(), '.pyenv'))).to.be.false;
        expect(fs.readFileSync(TestUtils.getPrimaryShellRc(), 'utf-8')).to.not.contain('pyenv');
        expect(testSpawn('which pyenv')).resolves.toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })
})
