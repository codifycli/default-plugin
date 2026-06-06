import { afterAll, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { Utils } from '@codifycli/plugin-core';

describe('macos-settings resource integration tests', { skip: !Utils.isMacOS() }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can configure mouse natural scrolling', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'macos-settings',
        mouse: {
          naturalScrolling: false,
        },
      },
    ], {
      skipUninstall: true,
      validateApply: async () => {
        const { data } = await testSpawn('defaults read NSGlobalDomain com.apple.swipescrolldirection');
        expect(data.trim()).toBe('0');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'macos-settings',
          mouse: {
            naturalScrolling: true,
          },
        }],
        validateModify: async () => {
          const { data } = await testSpawn('defaults read NSGlobalDomain com.apple.swipescrolldirection');
          expect(data.trim()).toBe('1');
        },
      },
    });
  });

  it('Can configure Dock settings', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'macos-settings',
        dock: {
          autohide: true,
          iconSize: 36,
          showRecents: false,
        },
      },
    ], {
      skipUninstall: true,
      validateApply: async () => {
        const { data: autohide } = await testSpawn('defaults read com.apple.dock autohide');
        expect(autohide.trim()).toBe('1');

        const { data: tilesize } = await testSpawn('defaults read com.apple.dock tilesize');
        expect(parseInt(tilesize.trim(), 10)).toBe(36);

        const { data: showRecents } = await testSpawn('defaults read com.apple.dock show-recents');
        expect(showRecents.trim()).toBe('0');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'macos-settings',
          dock: {
            autohide: false,
            iconSize: 48,
            showRecents: true,
          },
        }],
        validateModify: async () => {
          const { data: autohide } = await testSpawn('defaults read com.apple.dock autohide');
          expect(autohide.trim()).toBe('0');

          const { data: tilesize } = await testSpawn('defaults read com.apple.dock tilesize');
          expect(parseInt(tilesize.trim(), 10)).toBe(48);
        },
      },
    });
  });

  it('Can configure keyboard settings', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'macos-settings',
        keyboard: {
          keyRepeat: 2,
          initialKeyRepeat: 15,
          pressAndHold: false,
        },
      },
    ], {
      skipUninstall: true,
      validateApply: async () => {
        const { data: keyRepeat } = await testSpawn('defaults read NSGlobalDomain KeyRepeat');
        expect(parseInt(keyRepeat.trim(), 10)).toBe(2);

        const { data: initialKeyRepeat } = await testSpawn('defaults read NSGlobalDomain InitialKeyRepeat');
        expect(parseInt(initialKeyRepeat.trim(), 10)).toBe(15);

        const { data: pressAndHold } = await testSpawn('defaults read NSGlobalDomain ApplePressAndHoldEnabled');
        expect(pressAndHold.trim()).toBe('0');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'macos-settings',
          keyboard: {
            keyRepeat: 6,
            initialKeyRepeat: 68,
            pressAndHold: true,
          },
        }],
        validateModify: async () => {
          const { data: keyRepeat } = await testSpawn('defaults read NSGlobalDomain KeyRepeat');
          expect(parseInt(keyRepeat.trim(), 10)).toBe(6);

          const { data: initialKeyRepeat } = await testSpawn('defaults read NSGlobalDomain InitialKeyRepeat');
          expect(parseInt(initialKeyRepeat.trim(), 10)).toBe(68);
        },
      },
    });
  });

  afterAll(async () => {
    await testSpawn('defaults delete NSGlobalDomain com.apple.swipescrolldirection');
    await testSpawn('defaults delete com.apple.dock tilesize');
    await testSpawn('defaults delete com.apple.dock autohide');
    await testSpawn('defaults delete com.apple.dock show-recents');
    await testSpawn('defaults delete NSGlobalDomain KeyRepeat');
    await testSpawn('defaults delete NSGlobalDomain InitialKeyRepeat');
    await testSpawn('defaults delete NSGlobalDomain ApplePressAndHoldEnabled');
    await testSpawn('killall Dock');
  });
});
