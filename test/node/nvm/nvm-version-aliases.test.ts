import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

import { expectConverged } from '../../version-alias-utils.js';

describe('nvm latest / lts keywords', () => {
  const pluginPath = path.resolve('./src/index.ts');
  const config = { type: 'nvm', nodeVersions: ['lts', 'latest'], global: 'lts' };

  it('Installs the latest and LTS releases and converges', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [config], {
      validateApply: async () => {
        const lts = (await testSpawn('nvm version-remote --lts')).data.trim();
        const latest = (await testSpawn('nvm version-remote node')).data.trim();

        const installed = (await testSpawn('nvm ls --no-colors')).data;
        expect(installed).toContain(lts);
        expect(installed).toContain(latest);
        expect((await testSpawn('node --version')).data.trim()).toBe(lts);

        await expectConverged(pluginPath, config);
      },
      validateImport: (results) => {
        // Import with the user's config maps the installed releases back to the keywords
        expect(results[0]?.parameters.nodeVersions).toEqual(expect.arrayContaining(['lts', 'latest']));
      },
    });
  });
});
