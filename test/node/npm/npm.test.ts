import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Npm tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    await PluginTester.install(pluginPath, [
      {
        type: 'nvm',
        global: '24',
        nodeVersions: ['24'],
      }
    ]);
  }, 500000);

  it('Can install a global package with npm', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'npm',
        globalInstall: ['npm-run-all'],
      }
    ], {
      skipUninstall: true,
      validateApply: async () => {
        expect(await testSpawn('which npm-run-all')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
    });
  });

  // Don't uninstall nodeJS here. We need it for the test harness
});
