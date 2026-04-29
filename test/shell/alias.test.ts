import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import os from 'node:os';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Alias resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can add an alias to shell rc', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'alias',
        alias: 'my-alias',
        value: 'ls -l'
      }
    ], {
      validateApply: async () => {
        const { data: aliasOutput } = await testSpawn('alias')
        expect(aliasOutput).to.include('my-alias');
        expect(aliasOutput).to.include('ls -l');

        // Alias expansion only happens in an interactive shell.
        expect((await testSpawn(TestUtils.getInteractiveCommand('my-alias -a'))).data).to.include('src')
      },
      testModify: {
        modifiedConfigs: [{
          type: 'alias',
          alias: 'my-alias',
          value: 'pwd'
        }],
        validateModify: async () => {
          const { data: aliasOutput } = await testSpawn('alias')
          expect(aliasOutput).to.include('my-alias');
          expect(aliasOutput).to.include('pwd');
          expect(aliasOutput).to.include('my-alias');
          expect(aliasOutput).to.include('pwd');
          expect((await testSpawn('my-alias')).data).to.eq((await testSpawn('pwd')).data)
        }
      },
      skipImport: true,
      validateDestroy: async () => {
        const { data: aliasOutput } = await testSpawn('alias');
        expect(aliasOutput).to.not.include('my-alias');
        expect(await testSpawn('my-alias')).toMatchObject({ status: SpawnStatus.ERROR });
      },
    });
  })

  it('Validates against invalid alias', { timeout: 300000 }, async () => {
    expect(async () => PluginTester.fullTest(pluginPath, [
      {
        type: 'alias',
        alias: 'test$$$',
        value: 'ls'
      }
    ], {
      skipImport: true,
    })).rejects.toThrowError();
  })
})
