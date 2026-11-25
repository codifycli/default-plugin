import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

import { expectConverged } from '../../version-alias-utils.js';

describe('fnm latest / lts keywords', () => {
  const pluginPath = path.resolve('./src/index.ts');
  const config = { type: 'fnm', nodeVersions: ['lts', 'latest'], defaultVersion: 'lts' };

  it('Installs the latest and LTS releases and converges', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [config], {
      validateApply: async () => {
        const remote = (await testSpawn('fnm list-remote')).data.split('\n').filter((l) => l.startsWith('v'));
        const latest = remote.at(-1)!.split(' ')[0];
        const lts = remote.filter((l) => l.includes('(')).at(-1)!.split(' ')[0];

        const installed = (await testSpawn('fnm list')).data;
        expect(installed).toContain(lts);
        expect(installed).toContain(latest);
        expect((await testSpawn('fnm exec --using=default node --version')).data.trim()).toContain(lts);

        await expectConverged(pluginPath, config);
      },
    });
  });
});
