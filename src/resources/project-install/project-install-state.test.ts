import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake shell: records commands and always succeeds, so no real package manager ever runs.
const commands: string[] = [];
vi.mock('@codifycli/plugin-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codifycli/plugin-core')>();
  const result = { status: 'success', exitCode: 0, data: '' };
  return {
    ...actual,
    getPty: () => ({
      spawn: async (cmd: string) => { commands.push(cmd); return result; },
      spawnSafe: async (cmd: string) => { commands.push(cmd); return result; },
    }),
  };
});

const { getDirectoryStatus, installDirectory, isDirectoryInSync } = await import('./package-managers.js');

describe('project-install state tracking', () => {
  let dir: string;

  beforeEach(async () => {
    commands.length = 0;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-install-'));
    await fs.writeFile(path.join(dir, 'package.json'), '{"name":"x"}');
    await fs.writeFile(path.join(dir, 'package-lock.json'), '{"v":1}');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('is out of date before the first install and up to date after it', async () => {
    expect(await isDirectoryInSync(dir, {})).toBe(false);

    await installDirectory(dir, {});
    expect(commands.some((c) => c.endsWith('npm install'))).toBe(true);
    expect(await isDirectoryInSync(dir, {})).toBe(true);
  });

  it('becomes out of date when the lockfile changes or node_modules is deleted', async () => {
    await installDirectory(dir, {});

    await fs.writeFile(path.join(dir, 'package-lock.json'), '{"v":2}');
    expect(await isDirectoryInSync(dir, {})).toBe(false);

    await installDirectory(dir, {});
    expect(await isDirectoryInSync(dir, {})).toBe(true);

    await fs.rm(path.join(dir, 'node_modules'), { recursive: true });
    expect(await isDirectoryInSync(dir, {})).toBe(false);
  });

  it('skips managers that are already up to date', async () => {
    await installDirectory(dir, {});
    commands.length = 0;

    await installDirectory(dir, {});
    expect(commands.some((c) => c.includes('npm install'))).toBe(false);
  });

  it('reports a missing directory as not existing', async () => {
    expect(await getDirectoryStatus(path.join(dir, 'missing'), {})).toEqual({ exists: false, managers: [], stale: [] });
    await expect(installDirectory(path.join(dir, 'missing'), {})).rejects.toThrow(/does not exist/);
  });

  it('errors when nothing can be installed', async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'project-install-empty-'));
    await expect(installDirectory(empty, {})).rejects.toThrow(/no supported package manager/);
    await fs.rm(empty, { recursive: true, force: true });
  });

  it('installs pip requirements into the default .venv', async () => {
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'requests==2.32.0');
    await installDirectory(dir, { packageManagers: ['pip'] });

    expect(commands.some((c) => c.includes(`python3 -m venv '${path.join(dir, '.venv')}'`))).toBe(true);
    expect(await fs.readFile(path.join(dir, '.venv', '.codify-project-install.json'), 'utf8')).toContain('"pip"');
  });

  it('reuses an existing venv directory for pip', async () => {
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'requests==2.32.0');
    await fs.mkdir(path.join(dir, 'venv'));
    await fs.writeFile(path.join(dir, 'venv', 'pyvenv.cfg'), 'home = /usr/bin');

    await installDirectory(dir, { packageManagers: ['pip'] });
    expect(commands.some((c) => c.includes(`'${path.join(dir, 'venv', 'bin', 'python')}' -m pip install -r requirements.txt`))).toBe(true);
  });
});
