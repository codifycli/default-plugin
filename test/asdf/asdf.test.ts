import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn, TestUtils } from 'codify-plugin-test';
import * as path from 'node:path';
import * as cp from 'child_process'
import { SpawnStatus } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import os from 'node:os';

describe('Asdf tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install asdf and plugins', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'asdf',
        plugins: ['golang', 'php']
      },
      {
        type: 'asdf-plugin',
        plugin: 'golang',
        versions: ['latest', '1.24.11']
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which asdf')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which go')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('which asdf')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('which go')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  })

  it('Support plugins resource', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'asdf',
      },
      {
        type: 'asdf-plugin',
        plugin: 'golang',
        versions: ['latest']
      }
    ], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which asdf;')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which go')).toMatchObject({ status: SpawnStatus.SUCCESS });
      }
    });
  })

  it('Can install custom gitUrls', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'asdf',
      },
      {
        type: 'asdf-plugin',
        plugin: 'zig',
        gitUrl: 'https://github.com/asdf-community/asdf-zig.git',
        versions: ['latest']
      }
    ], {
      skipUninstall: true,
    });

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'asdf',
      },
      {
        type: 'asdf-plugin',
        plugin: 'zig',
        gitUrl: 'https://github.com/asdf-community/asdf-zig.git',
        versions: ['latest']
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which zig')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which asdf')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('which zig')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('which asdf')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  })

  afterAll(async () => {
    const { status: isAsdf } = await testSpawn('which asdf');
    if (isAsdf === SpawnStatus.SUCCESS) {
      await PluginTester.uninstall(pluginPath, [{
        type: 'asdf',
      }])
    }

    await fs.rm('~/.asdf', { recursive: true, force: true });
  }, 300_000)
})
