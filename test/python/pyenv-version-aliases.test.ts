import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

import { expectConverged } from '../version-alias-utils.js';

describe('pyenv latest keyword', () => {
  const pluginPath = path.resolve('./src/index.ts');
  const config = { type: 'pyenv', pythonVersions: ['latest'] };

  it('Installs the latest CPython release and converges', { timeout: 1200000 }, async () => {
    await PluginTester.install(pluginPath, [{
      type: 'homebrew',
      formulae: ['readline', 'openssl@3'],
      os: ['macOS'],
    }]);

    await PluginTester.fullTest(pluginPath, [config], {
      validateApply: async () => {
        const latest = (await testSpawn('pyenv latest -k 3')).data.trim();
        expect((await testSpawn('pyenv versions --bare')).data).toContain(latest);

        await expectConverged(pluginPath, config);
      },
    });
  });
});
