import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

import { newestVersion, parseNodeReleaseList } from '../../../src/utils/version-aliases.js';
import { expectConverged } from '../../version-alias-utils.js';

describe('fnm latest / lts keywords', () => {
  const pluginPath = path.resolve('./src/index.ts');
  const config = { type: 'fnm', nodeVersions: ['lts', 'latest'], defaultVersion: 'lts' };

  it('Installs the latest and LTS releases and converges', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [config], {
      validateApply: async () => {
        const remote = parseNodeReleaseList((await testSpawn('fnm list-remote')).data);
        const latest = `v${newestVersion(remote.map((r) => r.version))}`;
        const lts = `v${newestVersion(remote.filter((r) => r.isLts).map((r) => r.version))}`;

        const installed = (await testSpawn('fnm list')).data;
        expect(installed).toContain(lts);
        expect(installed).toContain(latest);
        expect((await testSpawn('fnm exec --using=default node --version')).data.trim()).toContain(lts);

        await expectConverged(pluginPath, config);
      },
    });
  });
});
