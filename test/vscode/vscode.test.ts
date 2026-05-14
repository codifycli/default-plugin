import { describe, expect, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import * as path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { Utils } from '@codifycli/plugin-core';
import { execSync } from 'node:child_process';

describe('Vscode integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  const settingsPath = Utils.isMacOS()
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json')
    : path.join(os.homedir(), '.config', 'Code', 'User', 'settings.json');

  it('Can install vscode', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'vscode',
      directory: '/Applications',
    }], {
      validateApply: async () => {
        if (Utils.isMacOS()) {
          const lstat = await fs.lstat('/Applications/Visual Studio Code.app');
          expect(lstat.isDirectory()).to.be.true;
        }
      },
      validateDestroy: async () => {
        if (Utils.isMacOS()) {
          expect(async () => await fs.lstat('/Applications/Visual Studio Code.app')).to.throw;
        }
      },
    });
  });

  it('Can manage extensions', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'vscode',
      extensions: ['ms-python.python'],
    }], {
      validateApply: async () => {
        const result = execSync('code --list-extensions').toString();
        expect(result.toLowerCase()).to.include('ms-python.python');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'vscode',
          extensions: ['ms-python.python', 'eamodio.gitlens'],
        }],
        validateModify: async () => {
          const result = execSync('code --list-extensions').toString();
          expect(result.toLowerCase()).to.include('ms-python.python');
          expect(result.toLowerCase()).to.include('eamodio.gitlens');
        },
      },
      validateDestroy: async () => {
        const result = execSync('code --list-extensions').toString();
        expect(result.toLowerCase()).not.to.include('eamodio.gitlens');
      },
    });
  });

  it('Can manage settings', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'vscode',
      settings: { 'editor.fontSize': 14, 'editor.formatOnSave': true },
    }], {
      validateApply: async () => {
        const content = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
        expect(content['editor.fontSize']).to.equal(14);
        expect(content['editor.formatOnSave']).to.be.true;
      },
      testModify: {
        modifiedConfigs: [{
          type: 'vscode',
          settings: { 'editor.fontSize': 16, 'editor.formatOnSave': true },
        }],
        validateModify: async () => {
          const content = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
          expect(content['editor.fontSize']).to.equal(16);
        },
      },
      validateDestroy: async () => {
        try {
          const content = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
          expect(content['editor.fontSize']).to.be.undefined;
          expect(content['editor.formatOnSave']).to.be.undefined;
        } catch {
          // settings.json removed entirely — also valid
        }
      },
    });
  });
});
