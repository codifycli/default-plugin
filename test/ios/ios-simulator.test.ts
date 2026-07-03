import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

function isXcodeInstalled(): boolean {
  const result = spawnSync('xcrun', ['simctl', 'help'], { stdio: 'ignore' });
  return result.status === 0;
}

const skip = !Utils.isMacOS() || !isXcodeInstalled();

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
            runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
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
              runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
            },
            {
              name: 'codify-test-ipad',
              deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPad-mini-6th-generation',
              runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
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
