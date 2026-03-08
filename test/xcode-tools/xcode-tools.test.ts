import { describe, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { Utils } from '@codifycli/plugin-core';

const pluginPath = path.resolve('./src/index.ts');

describe('XCode tools install tests', { skip: !Utils.isMacOS() }, async () => {
  it('Can uninstall xcode tools', { timeout: 300_000 }, async () => {
    await PluginTester.uninstall(pluginPath, [{
      type: 'xcode-tools'
    }])
  })
  
  it('Can install xcode tools', { timeout: 500_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'xcode-tools',
    }], {
      skipUninstall: true,
      skipImport: true,
    });
  })
})
