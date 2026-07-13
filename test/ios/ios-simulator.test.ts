import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

function isXcodeInstalled(): boolean {
  const result = spawnSync('xcrun', ['simctl', 'help'], { stdio: 'ignore' });
  return result.status === 0;
}

// Apple only allows downloading simulator runtimes compatible with the installed Xcode version, so a
// hardcoded runtime (e.g. iOS 18) inevitably falls out of that window as Xcode is upgraded on CI runners.
// Resolve the newest runtime already available on the host instead, so the test doesn't depend on a
// specific iOS version being downloadable.
function getLatestAvailableRuntime(prefix: string): string | undefined {
  const result = spawnSync('xcrun', ['simctl', 'list', 'runtimes', '--json'], { encoding: 'utf8' });
  if (result.status !== 0) return undefined;

  try {
    const parsed = JSON.parse(result.stdout);
    const identifiers: string[] = parsed.runtimes
      .filter((r: any) => r.isAvailable && r.identifier.startsWith(prefix))
      .map((r: any) => r.identifier);
    return identifiers.sort().at(-1);
  } catch {
    return undefined;
  }
}

const xcodeInstalled = Utils.isMacOS() && isXcodeInstalled();
const iosRuntime = xcodeInstalled
  ? getLatestAvailableRuntime('com.apple.CoreSimulator.SimRuntime.iOS-')
  : undefined;
const skip = !xcodeInstalled || !iosRuntime;

describe('iOS Simulator tests', { skip }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can create, add a simulator, and destroy iOS simulators', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'ios-simulators',
        simulators: [
          {
            name: 'codify-test-iphone',
            deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            runtime: iosRuntime!,
          },
        ],
      },
    ], {
      validateApply: async () => {
        const { data, status } = await testSpawn('xcrun simctl list devices --json');
        expect(status).toBe(SpawnStatus.SUCCESS);
        const parsed = JSON.parse(data);
        const allDevices: any[] = Object.values(parsed.devices).flat();
        expect(allDevices.find((d: any) => d.name === 'codify-test-iphone')).toBeDefined();
      },
      testModify: {
        modifiedConfigs: [{
          type: 'ios-simulators',
          simulators: [
            {
              name: 'codify-test-iphone',
              deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              runtime: iosRuntime!,
            },
            {
              name: 'codify-test-ipad',
              deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPad-mini-6th-generation',
              runtime: iosRuntime!,
            },
          ],
        }],
        validateModify: async () => {
          const { data } = await testSpawn('xcrun simctl list devices --json');
          const parsed = JSON.parse(data);
          const allDevices: any[] = Object.values(parsed.devices).flat();
          expect(allDevices.find((d: any) => d.name === 'codify-test-iphone')).toBeDefined();
          expect(allDevices.find((d: any) => d.name === 'codify-test-ipad')).toBeDefined();
        },
      },
      validateDestroy: async () => {
        const { data } = await testSpawn('xcrun simctl list devices --json');
        const parsed = JSON.parse(data);
        const allDevices: any[] = Object.values(parsed.devices).flat();
        expect(allDevices.find((d: any) => d.name === 'codify-test-iphone')).toBeUndefined();
        expect(allDevices.find((d: any) => d.name === 'codify-test-ipad')).toBeUndefined();
      },
    });
  });
});
