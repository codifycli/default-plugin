import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

import { expectConverged } from '../version-alias-utils.js';

describe('goenv latest keyword', () => {
  const pluginPath = path.resolve('./src/index.ts');
  const config = { type: 'goenv', goVersions: ['latest'] };

  it('Installs the latest Go release and converges', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [config], {
      validateApply: async () => {
        const installed = (await testSpawn('goenv versions --bare')).data.trim();
        expect(installed).toMatch(/^\d+\.\d+(\.\d+)?$/m);

        await expectConverged(pluginPath, config);
      },
    });
  });
});
