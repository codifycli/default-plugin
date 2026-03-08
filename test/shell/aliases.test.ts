
import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { SpawnStatus } from '@codifycli/plugin-core';
import { ResourceOperation } from '@codifycli/schemas';

describe('Aliases resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can add aliases to shell rc', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'aliases',
        aliases: [
          { alias: 'my-alias', value: 'ls -l' },
          { alias: 'my-alias2', value: 'pwd' }
        ]
      }
    ], {
      validatePlan: (plans) => {
        console.log(JSON.stringify(plans, null, 2))
      },
      validateApply: async () => {
        const { data: aliasOutput } = await testSpawn('alias')
        expect(aliasOutput).to.include('my-alias');
        expect(aliasOutput).to.include('ls -l');
        expect(aliasOutput).to.include('my-alias2');
        expect(aliasOutput).to.include('pwd');

        // Alias expansion only happens in an interactive shell.
        expect((await testSpawn(TestUtils.getInteractiveCommand('my-alias -a'))).data).to.include('src')
        expect((await testSpawn(TestUtils.getInteractiveCommand('my-alias2'))).data).to.include((await testSpawn('pwd')).data)
      },
      testModify: {
        modifiedConfigs: [{
          type: 'aliases',
          aliases: [
            { alias: 'my-alias', value: 'cd .' },
            { alias: 'my-alias2', value: 'cd ..' },
            { alias: 'my-alias3', value: 'cd ../..' }
          ]
        }],
        validateModify: async (plans) => {
          console.log('Modify plans', JSON.stringify(plans, null, 2));

          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
            parameters: [{
              previousValue: [
                { alias: 'my-alias', value: 'ls -l' },
                { alias: 'my-alias2', value: 'pwd' }
              ],
              newValue: [
                { alias: 'my-alias', value: 'cd .' },
                { alias: 'my-alias2', value: 'cd ..' },
                { alias: 'my-alias3', value: 'cd ../..' }
              ]
            }]
          })

          const { data: aliasOutput } = await testSpawn('alias')
          expect(aliasOutput).to.include('my-alias');
          expect(aliasOutput).to.include('my-alias2');
          expect(aliasOutput).to.include('my-alias3')

          expect((await testSpawn('my-alias')).data).to.eq((await testSpawn('cd .')).data)
          expect((await testSpawn('my-alias2')).data).to.eq((await testSpawn('cd ..')).data)
          expect((await testSpawn('my-alias3')).data).to.eq((await testSpawn('cd ../..')).data)
        }
      },
      validateDestroy: async () => {
        const { data: aliasOutput } = await testSpawn('alias');
        expect(aliasOutput).to.not.include('my-alias');
        expect(aliasOutput).to.not.include('my-alias2');
        expect(aliasOutput).to.not.include('my-alias3');

        expect(await testSpawn('my-alias')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('my-alias2')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('my-alias3')).toMatchObject({ status: SpawnStatus.ERROR });
      },
    });
  })
})
