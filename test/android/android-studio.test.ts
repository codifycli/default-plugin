import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Utils } from '@codifycli/plugin-core';

describe('Android studios tests', { skip: !Utils.isMacOS() }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install the latest Android studios', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'android-studio' }
    ], {
      validateApply: async () => {
        const programPath = '/Applications/Android Studio.app'
        const lstat = await fs.lstat(programPath);
        expect(lstat.isDirectory()).to.be.true;
      },
      validateDestroy: async () => {
        const programPath = '/Applications/Android Studio.app'
        expect(async () => await fs.lstat(programPath)).to.throw;
      }
    });
  })
})
