import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

const pluginPath = path.resolve('./src/index.ts');

describe('Terraform tests', async () => {
  it('Can install the latest terraform in the default location', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: "terraform"
    }], {
      validateApply: async () => {
        expect(await testSpawn('terraform -v')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('terraform -v')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })

  it('Can install the latest terraform in a custom location', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: "terraform",
      directory: '~/path/to/bin'
    }], {
      validateApply: async () => {
        expect(await testSpawn('terraform -v')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('terraform -v')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })

  it('Can install the a custom version of Terraform', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: "terraform",
      version: '1.4.2',
    }], {
      skipUninstall: true,
      validateApply: async () => {
        expect((await testSpawn('terraform -v')).data).to.include('1.4.2')
      },
      validateDestroy: async () => {
        expect(await testSpawn('terraform -v')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })

  it('Can upgrade the version of Terraform', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: "terraform",
      version: '1.5.2',
    }], {
      validateApply: async () => {
        expect((await testSpawn('terraform -v')).data).to.include('1.5.2')
      },
      validateDestroy: async () => {
        expect(await testSpawn('terraform -v')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    })
  })
})
