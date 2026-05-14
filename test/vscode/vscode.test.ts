import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import fs from 'node:fs/promises';
import * as os from 'node:os';
import { Utils } from '@codifycli/plugin-core';

describe('Vscode integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  // On macOS the code binary is inside the app bundle and not on PATH until a new shell is opened.
  const codeBin = Utils.isMacOS()
    ? '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
    : 'code';

  const settingsFile = Utils.isMacOS()
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
        const { data } = await testSpawn(`"${codeBin}" --list-extensions`);
        expect(data?.toLowerCase()).to.include('ms-python.python');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'vscode',
          extensions: ['ms-python.python', 'eamodio.gitlens'],
        }],
        validateModify: async () => {
          const { data } = await testSpawn(`"${codeBin}" --list-extensions`);
          expect(data?.toLowerCase()).to.include('ms-python.python');
          expect(data?.toLowerCase()).to.include('eamodio.gitlens');
        },
      },
      validateDestroy: async () => {
        const { data } = await testSpawn(`"${codeBin}" --list-extensions`);
        expect(data?.toLowerCase()).not.to.include('eamodio.gitlens');
      },
    });
  });

  it('Can manage settings', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'vscode',
      settings: { 'editor.fontSize': 14, 'editor.formatOnSave': true },
    }], {
      validateApply: async () => {
        const { data } = await testSpawn(`cat "${settingsFile}"`);
        const content = JSON.parse(data!);
        expect(content['editor.fontSize']).to.equal(14);
        expect(content['editor.formatOnSave']).to.be.true;
      },
      testModify: {
        modifiedConfigs: [{
          type: 'vscode',
          settings: { 'editor.fontSize': 16, 'editor.formatOnSave': true },
        }],
        validateModify: async () => {
          const { data } = await testSpawn(`cat "${settingsFile}"`);
          const content = JSON.parse(data!);
          expect(content['editor.fontSize']).to.equal(16);
        },
      },
    });
  });
});
