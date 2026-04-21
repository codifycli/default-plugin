import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import fs from 'node:fs';
import { TestUtils } from '../../test-utils.js';

describe('Pnpm tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall pnpm', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'pnpm' },
    ], {
      validateDestroy: async () => {
        const shellRcFile = fs.readFileSync(TestUtils.getPrimaryShellRc(), 'utf8')
        expect(shellRcFile).to.not.include('pnpm');
      }
    })
  })

  it('Can install nodeJS via pnpm', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'pnpm', globalEnvNodeVersion: '20' },
    ], {
      validateApply: async () => {
        const result = await testSpawn('node -v');
        expect(result.data).to.include('20')
      },
      validateDestroy: async () => {
        const shellRcFile = fs.readFileSync(TestUtils.getPrimaryShellRc(), 'utf8')
        expect(shellRcFile).to.not.include('pnpm');
      }
    })
  })
})
