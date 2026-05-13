import { describe, it, expect } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('fast-node-manager tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install fnm and node', { timeout: 500000, skip: true }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'fast-node-manager',
        defaultVersion: '20',
        nodeVersions: ['20', '18'],
      },
    ], {
      validateApply: async () => {
        expect(testSpawn('fnm --version', { interactive: true })).resolves.toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(testSpawn('node --version', { interactive: true })).resolves.toMatchObject({ data: expect.stringContaining('20') });

        const { data: installedVersions } = await testSpawn('fnm list', { interactive: true });
        expect(installedVersions).toContain('20');
        expect(installedVersions).toContain('18');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'fast-node-manager',
          defaultVersion: '22',
          nodeVersions: ['22'],
        }],
        validateModify: async () => {
          expect(testSpawn('node --version', { interactive: true })).resolves.toMatchObject({ data: expect.stringContaining('22') });
        },
      },
      validateDestroy: async () => {
        expect(testSpawn('fnm --version', { interactive: true })).resolves.toMatchObject({ status: SpawnStatus.ERROR });
      },
    });
  });
});
