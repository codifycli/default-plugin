import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { SpawnStatus } from '@codifycli/schemas';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

describe('Android CLI integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    const result = await testSpawn('which android');
    if (result.status === SpawnStatus.SUCCESS) {
      await PluginTester.uninstall(pluginPath, [{ type: 'android-cli' }]);
    }
  }, 120_000);

  it('Can install and uninstall Android CLI', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'android-cli' }],
      {
        validateApply: async () => {
          const result = await testSpawn('which android');
          expect(result.status).toBe(SpawnStatus.SUCCESS);
        },
        validateDestroy: async () => {
          const result = await testSpawn('which android');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );
  });

  it('Can install Android CLI with SDK packages', { timeout: 600_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        {
          type: 'android-cli',
          packages: ['cmdline-tools/latest', 'platform-tools'],
        },
      ],
      {
        validateApply: async () => {
          const which = await testSpawn('which android');
          expect(which.status).toBe(SpawnStatus.SUCCESS);

          const list = await testSpawn('android sdk list');
          expect(list.status).toBe(SpawnStatus.SUCCESS);
          expect(list.data).toContain('platform-tools');
        },
        testModify: {
          modifiedConfigs: [
            {
              type: 'android-cli',
              packages: ['platform-tools'],
            },
          ],
          validateModify: async () => {
            const list = await testSpawn('android sdk list');
            expect(list.status).toBe(SpawnStatus.SUCCESS);
            expect(list.data).toContain('platform-tools');
          },
        },
        validateDestroy: async () => {
          const result = await testSpawn('which android');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );
  });
});
