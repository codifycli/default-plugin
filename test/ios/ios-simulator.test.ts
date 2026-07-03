import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('iOS Simulator tests', { skip: !Utils.isMacOS() }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can create, modify state, and destroy an iOS simulator', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'ios-simulator',
        simulatorName: 'codify-test-iphone',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
        state: 'Shutdown',
      },
    ], {
      validateApply: async () => {
        const { data, status } = await testSpawn('xcrun simctl list devices --json');
        expect(status).toBe(SpawnStatus.SUCCESS);
        const parsed = JSON.parse(data);
        const allDevices: any[] = Object.values(parsed.devices).flat();
        const sim = allDevices.find((d: any) => d.name === 'codify-test-iphone');
        expect(sim).toBeDefined();
        expect(sim.state).toBe('Shutdown');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'ios-simulator',
          simulatorName: 'codify-test-iphone',
          deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
          runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
          state: 'Booted',
        }],
        validateModify: async () => {
          const { data } = await testSpawn('xcrun simctl list devices --json');
          const parsed = JSON.parse(data);
          const allDevices: any[] = Object.values(parsed.devices).flat();
          const sim = allDevices.find((d: any) => d.name === 'codify-test-iphone');
          expect(sim).toBeDefined();
          expect(sim.state).toBe('Booted');
        },
      },
      validateDestroy: async () => {
        const { data } = await testSpawn('xcrun simctl list devices --json');
        const parsed = JSON.parse(data);
        const allDevices: any[] = Object.values(parsed.devices).flat();
        const sim = allDevices.find((d: any) => d.name === 'codify-test-iphone');
        expect(sim).toBeUndefined();
      },
    });
  });
});
