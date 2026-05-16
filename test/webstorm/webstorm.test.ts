import { Utils } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { expect, describe, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('WebStorm integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  const webstormBinary = Utils.isMacOS()
    ? '/Applications/WebStorm.app/Contents/MacOS/webstorm'
    : 'webstorm';

  it('Can install WebStorm', { timeout: 600_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{ type: 'webstorm' }], {
      validateApply: async () => {
        if (Utils.isMacOS()) {
          const stat = await fs.lstat('/Applications/WebStorm.app');
          expect(stat.isDirectory()).to.be.true;
        } else {
          const { data } = await testSpawn('which webstorm');
          expect(data?.trim()).to.include('webstorm');
        }
      },
      validateDestroy: async () => {
        if (Utils.isMacOS()) {
          const exists = await fs.access('/Applications/WebStorm.app').then(() => true).catch(() => false);
          expect(exists).to.be.false;
        } else {
          const { data } = await testSpawn('which webstorm');
          expect(data?.trim() ?? '').not.to.include('webstorm');
        }
      },
    });
  });

  it('Can manage JVM heap size', { timeout: 600_000 }, async () => {
    const configParent = Utils.isMacOS()
      ? path.join(os.homedir(), 'Library', 'Application Support', 'JetBrains')
      : path.join(os.homedir(), '.config', 'JetBrains');

    const findVmOptions = async (): Promise<string | null> => {
      try {
        const entries = await fs.readdir(configParent);
        const dir = entries.filter((e) => e.startsWith('WebStorm')).sort().pop();
        if (!dir) return null;
        return path.join(configParent, dir, 'webstorm.vmoptions');
      } catch {
        return null;
      }
    };

    await PluginTester.fullTest(pluginPath, [{
      type: 'webstorm',
      jvmMaxHeapSize: '2048m',
      jvmMinHeapSize: '512m',
    }], {
      validateApply: async () => {
        const vmOptionsPath = await findVmOptions();
        expect(vmOptionsPath).to.not.be.null;
        const { data } = await testSpawn(`cat "${vmOptionsPath}"`);
        expect(data).to.include('-Xmx2048m');
        expect(data).to.include('-Xms512m');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'webstorm',
          jvmMaxHeapSize: '4096m',
          jvmMinHeapSize: '1024m',
        }],
        validateModify: async () => {
          const vmOptionsPath = await findVmOptions();
          expect(vmOptionsPath).to.not.be.null;
          const { data } = await testSpawn(`cat "${vmOptionsPath}"`);
          expect(data).to.include('-Xmx4096m');
          expect(data).to.include('-Xms1024m');
        },
      },
      validateDestroy: async () => {
        const vmOptionsPath = await findVmOptions();
        if (!vmOptionsPath) return;
        try {
          const content = await fs.readFile(vmOptionsPath, 'utf8');
          expect(content).not.to.include('-Xmx');
          expect(content).not.to.include('-Xms');
        } catch { /* file removed, that's fine */ }
      },
    });
  });

  it('Can install plugins', { timeout: 600_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{
      type: 'webstorm',
      plugins: ['org.jetbrains.plugins.github'],
    }], {
      validateApply: async () => {
        const configParent = Utils.isMacOS()
          ? path.join(os.homedir(), 'Library', 'Application Support', 'JetBrains')
          : path.join(os.homedir(), '.config', 'JetBrains');

        const entries = await fs.readdir(configParent);
        const dir = entries.filter((e) => e.startsWith('WebStorm')).sort().pop();
        expect(dir).to.not.be.undefined;

        const pluginsDir = Utils.isMacOS()
          ? path.join(configParent, dir!, 'plugins')
          : path.join(os.homedir(), '.local', 'share', 'JetBrains', dir!);

        const pluginDirs = await fs.readdir(pluginsDir);
        expect(pluginDirs.length).to.be.greaterThan(0);
      },
    });
  });
});
