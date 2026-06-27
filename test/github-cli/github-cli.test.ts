import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

describe('GitHub CLI integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    await PluginTester.uninstall(pluginPath, [{ type: 'github-cli' }]);
  }, 60_000);

  it('Can install and uninstall GitHub CLI', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'github-cli' }],
      {
        validateApply: async () => {
          const result = await testSpawn('which gh');
          expect(result.status).toBe(SpawnStatus.SUCCESS);
        },
        validateDestroy: async () => {
          const result = await testSpawn('which gh');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );
  });

  it('Can install GitHub CLI and configure git_protocol', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        {
          type: 'github-cli',
          gitProtocol: 'https',
          prompt: 'enabled',
        },
      ],
      {
        validateApply: async () => {
          const result = await testSpawn('gh config get git_protocol');
          expect(result.status).toBe(SpawnStatus.SUCCESS);
          expect(result.data.trim()).toBe('https');
        },
        testModify: {
          modifiedConfigs: [
            {
              type: 'github-cli',
              gitProtocol: 'ssh',
              prompt: 'enabled',
            },
          ],
          validateModify: async () => {
            const result = await testSpawn('gh config get git_protocol');
            expect(result.data.trim()).toBe('ssh');
          },
        },
        validateDestroy: async () => {
          const result = await testSpawn('which gh');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );
  });

  it('Can create and delete a gh alias', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        { type: 'github-cli' },
        {
          type: 'github-cli-alias',
          alias: 'codify-test-alias',
          expansion: 'pr list',
        },
      ],
      {
        validateApply: async () => {
          const result = await testSpawn('gh alias list');
          expect(result.status).toBe(SpawnStatus.SUCCESS);
          expect(result.data).toContain('codify-test-alias');
        },
        testModify: {
          modifiedConfigs: [
            {
              type: 'github-cli-alias',
              alias: 'codify-test-alias',
              expansion: 'pr status',
            },
          ],
          validateModify: async () => {
            const result = await testSpawn('gh alias list');
            expect(result.data).toContain('pr status');
          },
        },
        validateDestroy: async () => {
          const result = await testSpawn('gh alias list');
          if (result.status === SpawnStatus.SUCCESS) {
            expect(result.data).not.toContain('codify-test-alias');
          }
        },
      }
    );
  });
});
