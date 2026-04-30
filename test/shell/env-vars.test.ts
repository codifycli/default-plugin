import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { ResourceOperation } from '@codifycli/schemas';

describe('Env-vars resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can add multiple env vars to shell rc', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'env-vars',
        vars: [
          { variable: 'CODIFY_TEST_VAR1', value: 'value-one' },
          { variable: 'CODIFY_TEST_VAR2', value: 'value-two' },
        ],
      }
    ], {
      validateApply: async () => {
        const { data: out1 } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR1'));
        expect(out1).to.include('value-one');

        const { data: out2 } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR2'));
        expect(out2).to.include('value-two');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'env-vars',
          vars: [
            { variable: 'CODIFY_TEST_VAR1', value: 'updated-one' },
            { variable: 'CODIFY_TEST_VAR2', value: 'value-two' },
            { variable: 'CODIFY_TEST_VAR3', value: 'value-three' },
          ],
        }],
        validateModify: async (plans) => {
          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
            parameters: expect.arrayContaining([
              expect.objectContaining({
                previousValue: expect.arrayContaining([
                  { variable: 'CODIFY_TEST_VAR1', value: 'value-one' },
                  { variable: 'CODIFY_TEST_VAR2', value: 'value-two' },
                ]),
              })
            ])
          });

          const { data: out1 } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR1'));
          expect(out1).to.include('updated-one');

          const { data: out3 } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR3'));
          expect(out3).to.include('value-three');
        }
      },
      validateDestroy: async () => {
        const { data: out1 } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR1'));
        expect(out1.trim()).toBe('');

        const { data: out2 } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR2'));
        expect(out2.trim()).toBe('');

        const { data: out3 } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR3'));
        expect(out3.trim()).toBe('');
      },
    });
  })
})
