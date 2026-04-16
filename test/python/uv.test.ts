import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { afterAll, describe, expect, it } from 'vitest';
import * as path from 'node:path';

describe('uv resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs uv and manages Python versions', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'uv',
        pythonVersions: ['3.12'],
      },
    ], {
      validateApply: async () => {
        expect(await testSpawn('uv --version')).toMatchObject({ status: SpawnStatus.SUCCESS });

        const { data: pythonList } = await testSpawn('uv python list --only-installed');
        expect(pythonList).toContain('3.12');
      },
      validateDestroy: async () => {
        expect(await testSpawn('uv --version')).toMatchObject({ status: SpawnStatus.ERROR });
      },
    });
  });

  it('Installs uv and manages global tools', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'uv',
        tools: ['ruff'],
      },
    ], {
      validateApply: async () => {
        expect(await testSpawn('uv --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('uv tool list')).toMatchObject({
          status: SpawnStatus.SUCCESS,
          data: expect.stringContaining('ruff'),
        });
      },
      validateDestroy: async () => {
        expect(await testSpawn('uv --version')).toMatchObject({ status: SpawnStatus.ERROR });
      },
    });
  });

  afterAll(async () => {
    const { status } = await testSpawn('uv --version');
    if (status === SpawnStatus.SUCCESS) {
      await PluginTester.uninstall(pluginPath, [{ type: 'uv' }]);
    }
  }, 60_000);
});
