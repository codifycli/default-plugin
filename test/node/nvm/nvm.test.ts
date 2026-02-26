import { describe, it, expect, beforeEach } from 'vitest';
import { PluginTester, testSpawn } from 'codify-plugin-test';
import path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

// Example test suite
describe('nvm tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install nvm and node',  { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'nvm',
        global: '20',
        nodeVersions: ['20', '18']
      }
    ], {
      validateApply: async () => {
        // This validation does not work on Linux for some reason.
        // if (os.platform() === 'darwin') {
          expect(testSpawn('command -v nvm')).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(testSpawn('node --version')).resolves.toMatchObject({ data: expect.stringContaining('20') });

          const installedVersions = (await testSpawn('nvm list')).data;
          console.log('Installed versions: ', installedVersions);
          expect(installedVersions).to.include('20');
          expect(installedVersions).to.include('18');
        // }
      },
      testModify: {
        modifiedConfigs: [{
          type: 'nvm',
          global: '23',
          nodeVersions: ['23'],
        }],
        validateModify: () => {
          expect(testSpawn('node --version')).resolves.toMatchObject({ data: expect.stringContaining('23') });
        }
      },
      validateDestroy: () => {
        expect(testSpawn('command -v nvm')).resolves.toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });
});
