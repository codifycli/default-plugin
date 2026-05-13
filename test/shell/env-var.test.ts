import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { TestUtils } from '../test-utils.js';
import { ResourceOperation } from '@codifycli/schemas';

describe('Env-var resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can add an env var to shell rc', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'env-var',
        variable: 'CODIFY_TEST_VAR',
        value: 'hello-world',
      }
    ], {
      validateApply: async () => {
        const { data } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR'));
        expect(data).to.include('hello-world');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'env-var',
          variable: 'CODIFY_TEST_VAR',
          value: 'updated-value',
        }],
        validateModify: async (plans) => {
          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
          });

          const { data } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR'));
          expect(data).to.include('updated-value');
        }
      },
      skipImport: true,
      validateDestroy: async () => {
        const { data } = await testSpawn(TestUtils.getInteractiveCommand('echo $CODIFY_TEST_VAR'));
        expect(data.trim()).toBe('');
      },
    });
  })
})
