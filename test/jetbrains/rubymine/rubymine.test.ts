import { Utils } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('RubyMine integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  let xdgLine: string | null = null;

  beforeAll(async () => {
    if (!Utils.isLinux()) return;

    // Wait for unattended-upgrades to release the dpkg lock before running any apt installs.
    await testSpawn('systemctl stop unattended-upgrades || true', { requiresRoot: true });
    await testSpawn('flock /var/lib/dpkg/lock-frontend true', { requiresRoot: true });

    const uid = process.getuid!();
    const xdgDir = `/tmp/xdg-runtime-${uid}`;
    await fs.mkdir(xdgDir, { recursive: true });
    await fs.chmod(xdgDir, 0o700);
    process.env.XDG_RUNTIME_DIR = xdgDir;

    const bashrc = path.join(os.homedir(), '.bashrc');
    const line = `export XDG_RUNTIME_DIR=${xdgDir}`;
    const contents = await fs.readFile(bashrc, 'utf8').catch(() => '');
    if (!contents.includes(line)) {
      await fs.appendFile(bashrc, `\n${line}\n`);
      xdgLine = line;
    }
  });

  afterAll(async () => {
    if (!xdgLine) return;

    const bashrc = path.join(os.homedir(), '.bashrc');
    const contents = await fs.readFile(bashrc, 'utf8').catch(() => '');
    await fs.writeFile(bashrc, contents.replace(`\n${xdgLine}\n`, ''));
  });

  it('Can install RubyMine', { timeout: 600_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [{ type: 'rubymine' }], {
      validateApply: async () => {
        if (Utils.isMacOS()) {
          const stat = await fs.lstat('/Applications/RubyMine.app');
          expect(stat.isDirectory()).to.be.true;
        } else {
          const { data } = await testSpawn('which rubymine');
          expect(data?.trim()).to.include('rubymine');
        }
      },
      validateDestroy: async () => {
        if (Utils.isMacOS()) {
          const exists = await fs.access('/Applications/RubyMine.app').then(() => true).catch(() => false);
          expect(exists).to.be.false;
        } else {
          const { data } = await testSpawn('which rubymine');
          expect(data?.trim() ?? '').not.to.include('rubymine');
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
        const dir = entries.filter((e) => e.startsWith('RubyMine')).sort().pop();
        if (!dir) return null;
        return path.join(configParent, dir, 'rubymine.vmoptions');
      } catch {
        return null;
      }
    };

    await PluginTester.fullTest(pluginPath, [{
      type: 'rubymine',
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
          type: 'rubymine',
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
      type: 'rubymine',
      plugins: ['Docker'],
    }])
  })
});
