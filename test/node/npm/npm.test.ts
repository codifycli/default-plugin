import { describe, it, expect, beforeAll } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Npm tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    await PluginTester.install(pluginPath, [
      {
        type: 'nvm',
        global: '20',
        nodeVersions: ['20'],
      }
    ]);
  }, 500000);

  it('Can install a global package with npm', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'npm',
        globalInstall: ['pnpm'],
      }
    ], {
      validateApply: async () => {
        expect(await testSpawn('which nvm')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('node --version')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('nvm list')).toMatchObject({ status: SpawnStatus.SUCCESS });

        const { data: installedVersions } = await testSpawn('nvm list')
        expect(installedVersions).to.include('20');
        expect(installedVersions).to.include('18');
      },
    });
  });
});