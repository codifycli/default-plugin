import { describe, it, expect, beforeEach } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

// Example test suite
describe('Npm tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install nvm and a global package with npm',  { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'nvm',
        global: '20',
        nodeVersions: ['20']
      },
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
