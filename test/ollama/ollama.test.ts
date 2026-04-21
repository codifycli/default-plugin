import { SpawnStatus, Utils } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

describe('Ollama resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install ollama', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'ollama' }],
      {
        validateApply: async () => {
          expect(await testSpawn('which ollama')).toMatchObject({ status: SpawnStatus.SUCCESS });

          if (Utils.isMacOS()) {
            // Service should be running
            const serviceCheck = await testSpawn('brew services list');
            expect(serviceCheck.data).toContain('ollama');
          }
        },
        validateDestroy: async () => {
          expect(await testSpawn('which ollama')).toMatchObject({ status: SpawnStatus.ERROR });
        },
      }
    );
  });

  it('Can install ollama and pull a model', { timeout: 600_000 }, async () => {
    // Use a small model to keep the test fast
    const smallModel = 'smollm:135m';

    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'ollama', models: [smallModel] }],
      {
        validateApply: async () => {
          expect(await testSpawn('which ollama')).toMatchObject({ status: SpawnStatus.SUCCESS });

          const listResult = await testSpawn('ollama list');
          expect(listResult.status).toBe(SpawnStatus.SUCCESS);
          expect(listResult.data).toContain('smollm');
        },
        validateDestroy: async () => {
          expect(await testSpawn('which ollama')).toMatchObject({ status: SpawnStatus.ERROR });
        },
      }
    );
  });

  afterAll(async () => {
    // Best-effort cleanup in case tests left ollama installed
    if (Utils.isMacOS()) {
      await testSpawn('brew services stop ollama');
      await testSpawn('brew uninstall ollama');
    } else {
      await testSpawn('systemctl stop ollama', { requiresRoot: true });
      await testSpawn('rm -f /usr/local/bin/ollama', { requiresRoot: true });
    }
  }, 60_000);
});
