import { describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SpawnStatus } from '@codifycli/plugin-core';
import { TestUtils } from '../../test-utils.js';

describe('Jenv resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs jenv and java with homebrew', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'jenv',
        global: '17',
        add: ['17']
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('jenv doctor')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('java --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('jenv version')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      testModify: {
        modifiedConfigs: [{
          type: 'jenv',
          global: '21',
          add: ['17', '21']
        }],
        validateModify: async () => {
          expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(await testSpawn('java --version')).toMatchObject({ status: SpawnStatus.SUCCESS });

          const { data: jenvVersions } = await testSpawn('jenv versions')
          expect(jenvVersions).to.include('21')
          expect(jenvVersions).to.include('17')
        }
      },
      validateDestroy: async () => {
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });

  it('Installs jenv without setting a global version', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'jenv',
        add: ['17'],
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('jenv doctor')).toMatchObject({ status: SpawnStatus.SUCCESS });

        const { data: jenvVersions } = await testSpawn('jenv versions')
        expect(jenvVersions).to.include('17')

        // No global version pinned — jenv global should return "system"
        const { data: globalVersion } = await testSpawn('jenv global')
        expect(globalVersion.trim()).toBe('system')
      },
      validateDestroy: async () => {
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });

  it('Installs jenv using an explicit Homebrew path instead of version shorthand', { timeout: 500000, skip: !TestUtils.isMacOS() }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'jenv',
        add: ['/opt/homebrew/Cellar/openjdk@17'],
        global: '17',
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.SUCCESS });

        const { data: jenvVersions } = await testSpawn('jenv versions')
        expect(jenvVersions).to.include('17')

        const { data: globalVersion } = await testSpawn('jenv global')
        expect(globalVersion.trim()).toMatch(/^17/)
      },
      validateDestroy: async () => {
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });

  it('Removes jenv startup lines from shell RC on destroy', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'jenv',
        add: ['17'],
      }
    ], {
      validateApply: async () => {
        const rcContents = fs.readFileSync(TestUtils.getPrimaryShellRc(), 'utf-8');
        expect(rcContents).to.include('$HOME/.jenv/bin:$PATH');
        expect(rcContents).to.include('jenv init');
      },
      validateDestroy: async () => {
        expect(await testSpawn('which jenv')).toMatchObject({ status: SpawnStatus.ERROR });

        const rcContents = fs.readFileSync(TestUtils.getPrimaryShellRc(), 'utf-8');
        expect(rcContents).not.to.include('$HOME/.jenv/bin:$PATH');
        expect(rcContents).not.to.include('jenv init');

        expect(fs.existsSync(path.join(os.homedir(), '.jenv'))).toBe(false);
      }
    });
  });
})
