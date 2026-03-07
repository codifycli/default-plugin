import { afterAll, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';

describe('Tart tests', { skip: !Utils.isMacOS() }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install tart', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'tart',
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which tart')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('which tart')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });

  it('Can install tart with custom TART_HOME', { timeout: 300000 }, async () => {
    const customTartHome = path.join(process.env.HOME || '', '.tart-custom');

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'tart',
        tartHome: customTartHome,
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which tart')).toMatchObject({ status: SpawnStatus.SUCCESS });
        // Check if TART_HOME is set in shell
        const tartHome = (await testSpawn('echo $TART_HOME')).data.trim();
        expect(tartHome).toBe(customTartHome);
      },
      validateDestroy: async () => {
        expect(await testSpawn('which tart')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });

  // Normally skip this test because the 30gb download can take a long time
  it('Can clone a VM', { timeout: 1000000, skip: true }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'tart',
        clone: [{ sourceName: 'ghcr.io/cirruslabs/macos-sonoma-base:latest', name: 'my-custom-vm' }],
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which tart')).toMatchObject({ status: SpawnStatus.SUCCESS });
        // Check if the VM was cloned
        const vms = (await testSpawn('tart list')).data.trim();
        expect(vms).toContain('my-custom-vm');
      },
      validateDestroy: async () => {
        expect(await testSpawn('which tart')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  });

  afterAll(async () => {
    await fs.rm('~/.tart', { recursive: true, force: true });
    await fs.rm(path.join(process.env.HOME || '', '.tart-custom'), { recursive: true, force: true });
  }, 300_000);
});
