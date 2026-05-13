import { describe, expect, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import { Utils } from '@codifycli/plugin-core';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

describe('Android studios tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install the latest Android studios', { timeout: 300000 }, async () => {
    const isMacOS = Utils.isMacOS();
    const appPath = isMacOS
      ? '/Applications/Android Studio.app'
      : '/opt/android-studio';

    await PluginTester.fullTest(pluginPath, [
      { type: 'android-studio' }
    ], {
      validateApply: async () => {
        const lstat = await fs.lstat(appPath);
        expect(lstat.isDirectory()).to.be.true;

        if (!isMacOS) {
          const studioBin = path.join(appPath, 'bin', 'studio');
          await expect(fs.access(studioBin)).resolves.toBeUndefined();
        }
      },
      validateDestroy: async () => {
        expect(async () => await fs.lstat(appPath)).to.throw;
      }
    });
  })
})
