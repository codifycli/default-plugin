import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { SpawnStatus } from '@codifycli/schemas';
import * as path from 'node:path';
import * as os from 'node:os';
import { beforeAll, describe, expect, it } from 'vitest';

const isLinuxArm = os.platform() === 'linux' && os.arch() === 'arm64';

describe.skipIf(isLinuxArm)('Android CLI integration tests', async () => {
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
          sdkPackages:['cmdline-tools/latest', 'platform-tools'],
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
        validateDestroy: async () => {
          const result = await testSpawn('which android');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );
  });
});

describe.skipIf(isLinuxArm)('Android Emulator integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    const result = await testSpawn('which android');
    if (result.status === SpawnStatus.SUCCESS) {
      await PluginTester.uninstall(pluginPath, [{ type: 'android-cli' }]);
    }
  }, 120_000);

  it('Can create and destroy an Android emulator', { timeout: 900_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        {
          type: 'android-cli',
          sdkPackages: [
            'cmdline-tools/latest',
            'platform-tools',
            'platforms/android-35',
            'system-images/android-35/google_apis_playstore/x86_64',
          ],
          emulators: ['medium_phone'],
        },
      ],
      {
        validateApply: async () => {
          const list = await testSpawn('android emulator list');
          expect(list.status).toBe(SpawnStatus.SUCCESS);
          expect(list.data).toContain('medium_phone');
        },
        validateDestroy: async () => {
          const list = await testSpawn('android emulator list');
          expect(list.data).not.toContain('medium_phone');
        },
      }
    );
  });

});
