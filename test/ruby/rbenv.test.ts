import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { TestUtils } from '../test-utils.js';

describe('Rbenv resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs rbenv, installs a Ruby version, and sets a global', { timeout: 600000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'rbenv',
        rubyVersions: ['3.3.0'],
        global: '3.3.0',
      }
    ], {
      validateApply: async () => {
        const rbenvCheck = await testSpawn('rbenv --version');
        expect(rbenvCheck.status).toBe(SpawnStatus.SUCCESS);

        const { data: versions } = await testSpawn('rbenv versions');
        expect(versions).toContain('3.3.0');

        const { data: globalVersion } = await testSpawn('rbenv global');
        expect(globalVersion.trim()).toBe('3.3.0');

        const { data: rubyVersion } = await testSpawn('ruby -v');
        expect(rubyVersion.trim()).includes('3.3.0');
      },
      validateDestroy: () => {
        const shellRc = TestUtils.getPrimaryShellRc();
        if (fs.existsSync(shellRc)) {
          const shellRcContents = fs.readFileSync(shellRc, 'utf-8');
          expect(shellRcContents).not.toContain('rbenv init');
        }
      },
    });
  });
});
