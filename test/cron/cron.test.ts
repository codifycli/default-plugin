import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { ResourceOperation } from '@codifycli/schemas';

describe('Cron resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can add cron jobs to the crontab', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'cron',
        jobs: [
          { name: 'codify-test-job-1', schedule: '*/5 * * * *', command: 'echo job-one' },
          { name: 'codify-test-job-2', schedule: '0 3 * * *', command: 'echo job-two' },
        ],
      }
    ], {
      validatePlan: (plans) => {
        console.log(JSON.stringify(plans, null, 2))
      },
      validateApply: async () => {
        const { data: crontab } = await testSpawn('crontab -l');

        expect(crontab).to.include('# Codify managed: codify-test-job-1');
        expect(crontab).to.include('*/5 * * * * echo job-one');
        expect(crontab).to.include('# Codify managed: codify-test-job-2');
        expect(crontab).to.include('0 3 * * * echo job-two');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'cron',
          jobs: [
            { name: 'codify-test-job-1', schedule: '*/10 * * * *', command: 'echo job-one-updated' },
            { name: 'codify-test-job-2', schedule: '0 3 * * *', command: 'echo job-two' },
            { name: 'codify-test-job-3', schedule: '@daily', command: 'echo job-three' },
          ],
        }],
        validateModify: async (plans) => {
          console.log('Modify plans', JSON.stringify(plans, null, 2));

          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
          })

          const { data: crontab } = await testSpawn('crontab -l');

          expect(crontab).to.include('# Codify managed: codify-test-job-1');
          expect(crontab).to.include('*/10 * * * * echo job-one-updated');
          expect(crontab).to.not.include('*/5 * * * * echo job-one\n');
          expect(crontab).to.include('# Codify managed: codify-test-job-2');
          expect(crontab).to.include('0 3 * * * echo job-two');
          expect(crontab).to.include('# Codify managed: codify-test-job-3');
          expect(crontab).to.include('@daily echo job-three');
        }
      },
      validateDestroy: async () => {
        const { data: crontab } = await testSpawn('crontab -l');

        expect(crontab).to.not.include('codify-test-job-1');
        expect(crontab).to.not.include('codify-test-job-2');
        expect(crontab).to.not.include('codify-test-job-3');
      },
    });
  })
})
