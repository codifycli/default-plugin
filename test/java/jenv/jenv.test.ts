import { describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Jenv resource integration tests', { skip: !Utils.isMacOS() }, () => {
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
        expect(await testSpawn('which java')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });
})
