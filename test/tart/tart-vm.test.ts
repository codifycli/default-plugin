import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Tart VM tests', { skip: !Utils.isMacOS() }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can create a tart VM with memory and CPU settings', { timeout: 1200000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'tart',
      },
      {
        type: 'tart-vm',
        sourceName: 'ghcr.io/cirruslabs/macos-sonoma-base:latest',
        localName: 'test-vm-resources',
        memory: 8192,
        cpu: 4,
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which tart')).toMatchObject({ status: SpawnStatus.SUCCESS });
        // Check if the VM was created
        const vms = (await testSpawn('tart list')).data;
        expect(vms).toContain('test-vm-resources');

        // Check VM configuration
        const vmInfo = JSON.parse((await testSpawn('tart get test-vm-resources --format json')).data);
        expect(vmInfo.Memory).toBe(8192);
        expect(vmInfo.CPU).toBe(4);
      },
      testModify: {
        modifiedConfigs: [{
          type: 'tart-vm',
          sourceName: 'ghcr.io/cirruslabs/macos-sonoma-base:latest',
          localName: 'test-vm-resources',
          memory: 4096,
          cpu: 4,
        }]
      }
    });
  });
});
