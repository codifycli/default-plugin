import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester } from 'codify-plugin-test';
import * as path from 'node:path';
import fs from 'node:fs/promises';
import { Utils } from '@codifycli/plugin-core';

describe('Vscode integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install vscode', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'vscode',
      directory: '/Applications'
    }], {
      validateApply: async () => {
        if (Utils.isMacOS()) {
          const programPath = '/Applications/Visual Studio Code.app'
          const lstat = await fs.lstat(programPath);
          expect(lstat.isDirectory()).to.be.true;
        }
      },
      validateDestroy: async () => {
        if (Utils.isMacOS()) {
          const programPath = '/Applications/Visual Studio Code.app'
          expect(async () => await fs.lstat(programPath)).to.throw;
        }
      }
    });
  })
})
