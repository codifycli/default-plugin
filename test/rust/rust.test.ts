import { describe, it, expect } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

const pluginPath = path.resolve('./src/index.ts');

describe('Rust tests', async () => {
  it('Can install and uninstall Rust via rustup', { timeout: 600000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{ type: 'rust' }], {
      validateApply: async () => {
        expect(await testSpawn('rustup --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('rustc --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('cargo --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('rustup --version')).toMatchObject({ status: SpawnStatus.ERROR });
      },
    });
  });

  it('Can install Rust with cargo packages', { timeout: 900000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'rust', cargoPackages: ['ripgrep'] }],
      {
        validateApply: async () => {
          expect(await testSpawn('rustup --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
          expect(await testSpawn('rg --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
        },
        testModify: {
          modifiedConfigs: [{ type: 'rust', cargoPackages: ['ripgrep', 'fd-find'] }],
          validateModify: async () => {
            expect(await testSpawn('rg --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
            expect(await testSpawn('fd --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
          },
        },
        validateDestroy: async () => {
          expect(await testSpawn('rustup --version')).toMatchObject({ status: SpawnStatus.ERROR });
        },
      }
    );
  });
});
