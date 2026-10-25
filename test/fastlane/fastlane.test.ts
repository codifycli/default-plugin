import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('fastlane resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs Ruby as a prerequisite', { timeout: 600_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'rbenv', rubyVersions: ['3.3.0'], global: '3.3.0' },
    ], {
      skipUninstall: true,
      validateApply: async () => {
        const { data } = await testSpawn('ruby -v');
        expect(data).toContain('3.3.0');
      },
    });
  });

  it('Installs fastlane', { timeout: 600_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'fastlane' },
    ], {
      validateApply: async () => {
        const result = await testSpawn('fastlane --version');
        expect(result.status).toBe(SpawnStatus.SUCCESS);
      },
      validateDestroy: async () => {
        const result = await testSpawn('fastlane --version');
        expect(result.status).toBe(SpawnStatus.ERROR);
      },
    });
  });
});
