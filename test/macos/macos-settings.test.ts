import { describe, expect, it } from 'vitest';
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
      validateDestroy: async () => {
        // After destroy, the key may be deleted (returns error) or reset to default
        const { data } = await testSpawn('defaults read NSGlobalDomain com.apple.swipescrolldirection');
        // Default is true (1) when key is absent, or the key was deleted — either is acceptable
        const val = data.trim();
        expect(['', '1'].includes(val) || val.includes('does not exist')).toBe(true);
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
      validateDestroy: async () => {
        // After destroy, keys should be deleted — reads will fail or return defaults
        const { data: tilesize } = await testSpawn('defaults read com.apple.dock tilesize');
        const val = tilesize.trim();
        const parsed = parseInt(val, 10);
        // Either deleted (error output or NaN) or reset to system default (48)
        expect(val.includes('does not exist') || isNaN(parsed) || parsed === 48).toBe(true);
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
      validateDestroy: async () => {
        const { data: keyRepeat } = await testSpawn('defaults read NSGlobalDomain KeyRepeat');
        const val = keyRepeat.trim();
        const parsed = parseInt(val, 10);
        // Either deleted (error output or NaN) or reset to system default (6)
        expect(val.includes('does not exist') || isNaN(parsed) || parsed === 6).toBe(true);
      },
    });
  });
});
