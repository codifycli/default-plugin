import { beforeAll, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import fs from 'node:fs/promises';
import * as os from 'node:os';
import { Utils } from '@codifycli/plugin-core';

describe('Cursor integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  // On macOS the cursor binary is inside the app bundle and not on PATH until a new shell is opened.
  // On Linux the binary location depends on install method; resolve lazily after install.
  const getCursorBin = async () => Utils.isMacOS()
    ? '/Applications/Cursor.app/Contents/Resources/app/bin/cursor'
    : (await testSpawn('which cursor').then((r) => r.data?.trim()).catch(() => null))
      ?? path.join(os.homedir(), '.local', 'bin', 'cursor');

  const settingsFile = Utils.isMacOS()
    ? path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'settings.json')
    : path.join(os.homedir(), '.config', 'Cursor', 'User', 'settings.json');

  const mcpFile = path.join(os.homedir(), '.cursor', 'mcp.json');

  beforeAll(async () => {
    const lstat = fs.lstat(path.join(os.homedir(), '.cursor'))
    if ((await lstat).isDirectory()) {
      await fs.rmdir(path.join(os.homedir(), '.cursor'), { recursive: true, force: true });
    }
  })

  it('Can install cursor', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'cursor',
    }], {
      skipUninstall: true,
      validateApply: async () => {
        if (Utils.isMacOS()) {
          const lstat = await fs.lstat('/Applications/Cursor.app');
          expect(lstat.isDirectory()).to.be.true;
        } else {
          const bin = await getCursorBin();
          const lstat = await fs.lstat(bin);
          expect(lstat.isFile() || lstat.isSymbolicLink()).to.be.true;
        }
      },
      validateDestroy: async () => {
        if (Utils.isMacOS()) {
          expect(async () => await fs.lstat('/Applications/Cursor.app')).to.throw;
        }
      },
    });
  });

  it('Can manage extensions', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'cursor',
      extensions: ['ms-python.python'],
    }], {
      skipUninstall: true,
      validateApply: async () => {
        const { data } = await testSpawn(`"${await getCursorBin()}" --list-extensions`);
        expect(data?.toLowerCase()).to.include('ms-python.python');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'cursor',
          extensions: ['ms-python.python', 'eamodio.gitlens'],
        }],
        validateModify: async () => {
          const { data } = await testSpawn(`"${await getCursorBin()}" --list-extensions`);
          expect(data?.toLowerCase()).to.include('ms-python.python');
          expect(data?.toLowerCase()).to.include('eamodio.gitlens');
        },
      },
      validateDestroy: async () => {
        const { data } = await testSpawn(`"${await getCursorBin()}" --list-extensions`);
        expect(data?.toLowerCase()).not.to.include('eamodio.gitlens');
      },
    });
  });

  it('Can manage settings', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'cursor',
      settings: { 'editor.fontSize': 14, 'editor.formatOnSave': true },
    }], {
      skipUninstall: true,
      validateApply: async () => {
        const { data } = await testSpawn(`cat "${settingsFile}"`);
        const content = JSON.parse(data!);
        expect(content['editor.fontSize']).to.equal(14);
        expect(content['editor.formatOnSave']).to.be.true;
      },
      testModify: {
        modifiedConfigs: [{
          type: 'cursor',
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

  it('Can manage MCP servers', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'cursor',
      mcpServers: {
        filesystem: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      },
    }], {
      validateApply: async () => {
        const { data } = await testSpawn(`cat "${mcpFile}"`);
        const content = JSON.parse(data!);
        expect(content.mcpServers).to.have.property('filesystem');
        expect(content.mcpServers.filesystem.command).to.equal('npx');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'cursor',
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
            },
            github: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
            },
          },
        }],
        validateModify: async () => {
          const { data } = await testSpawn(`cat "${mcpFile}"`);
          const content = JSON.parse(data!);
          expect(content.mcpServers).to.have.property('filesystem');
          expect(content.mcpServers).to.have.property('github');
        },
      },
      validateDestroy: async () => {
        try {
          const { data } = await testSpawn(`cat "${mcpFile}"`);
          const content = JSON.parse(data!);
          expect(content.mcpServers).not.to.have.property('filesystem');
          expect(content.mcpServers).not.to.have.property('github');
        } catch {
          // File not existing is also acceptable
        }
      },
    });
  });
});
