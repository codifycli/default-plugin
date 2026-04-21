import { getPty } from '@codifycli/plugin-core';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { SpawnStatus, codifySpawn } from './codify-spawn.js';
import { SpotlightKind, SpotlightUtils } from './spotlight-search.js';

export const Utils = {
  async findApplication(name: string): Promise<string[]> {
    const [
      spotlightResult,
      applicationDir
    ] = await Promise.all([
      SpotlightUtils.mdfind(name, SpotlightKind.APPLICATION),
      Utils.findInFolder('/Applications', name)
    ])

    return [...new Set([...spotlightResult, ...applicationDir])]
  },

  async findInFolder(dir: string, search: string): Promise<string[]> {
    const data = await fs.readdir(dir);

    return data
      .filter((l) => l.includes(search))
      .map((l) => path.join(dir, l));
  },

  async createBinDirectoryIfNotExists(): Promise<void> {
    let lstat = null;
    try {
      lstat = await fs.lstat('/usr/local/bin')
    } catch {}

    if (lstat && lstat.isDirectory()) {
      return;
    }

    if (lstat && !lstat.isDirectory()) {
      throw new Error('Found file at /usr/local/bin. Cannot create a directory there')
    }

    await codifySpawn('sudo mkdir -p -m 775 /usr/local/bin')
  },

  async createDirectoryIfNotExists(path: string): Promise<void> {
    let lstat = null;
    try {
      lstat = await fs.lstat(path)
    } catch {}

    if (lstat && lstat.isDirectory()) {
      return;
    }

    if (lstat && !lstat.isDirectory()) {
      throw new Error(`Found file at ${path}. Cannot create a directory there`)
    }

    await fs.mkdir(path, { recursive: true })
  },

  async findInstallLocation(name: string): Promise<null | string> {
    const query = await codifySpawn(`which ${name}`, { throws: false });
    if (query.status === SpawnStatus.ERROR) {
      return null;
    }

    return query.data.trim();
  },

  async isArmArch(): Promise<boolean> {
    if (!Utils.isMacOS()) {
      // On Linux, check uname -m
      const query = await codifySpawn('uname -m');
      return query.data.trim() === 'aarch64' || query.data.trim() === 'arm64';
    }
    const query = await codifySpawn('sysctl -n machdep.cpu.brand_string');
    return /M(\d)/.test(query.data);
  },

  async isDirectoryOnPath(directory: string): Promise<boolean> {
    const $ = getPty();
    const { data: pathQuery } = await $.spawn('echo $PATH', { interactive: true });
    const lines = pathQuery.split(':');
    return lines.includes(directory);
  },

  async isHomebrewInstalled(): Promise<boolean> {
    const query = await codifySpawn('which brew', { throws: false });
    return query.status === SpawnStatus.SUCCESS;
  },

  async isRosetta2Installed(): Promise<boolean> {
    const query = await codifySpawn('arch -x86_64 /usr/bin/true 2> /dev/null', { throws: false });
    return query.status === SpawnStatus.SUCCESS;
  },
  
  shellEscape(arg: string): string {
    if (/[^\w/:=-]/.test(arg)) return arg.replaceAll(/([ !"#$%&'()*;<>?@[\\\]`{}~])/g, '\\$1')
    return arg;
  },

  async downloadUrlIntoFile(filePath: string, url: string): Promise<void> {
    const { body } = await fetch(url)

    const dirname = path.dirname(filePath);
    if (!await fs.stat(dirname).then((s) => s.isDirectory()).catch(() => false)) {
      await fs.mkdir(dirname, { recursive: true });
    }

    const ws = fsSync.createWriteStream(filePath)
    // Different type definitions here for readable stream (NodeJS vs DOM). Small hack to fix that
    await finished(Readable.fromWeb(body as never).pipe(ws));
  },

  getUser(): string {
    return os.userInfo().username;
  },

  isMacOS(): boolean {
    return os.platform() === 'darwin';
  },

  isLinux(): boolean {
    return os.platform() === 'linux';
  },

  async getShell(): Promise<'bash' | 'unknown' | 'zsh'> {
    const shell = process.env.SHELL || '';

    if (shell.includes('bash')) {
      return 'bash';
    }

    if (shell.includes('zsh')) {
      return 'zsh';
    }

    return 'unknown';
  },

  getShellRcFiles(): string[] {
    const shell = process.env.SHELL || '';
    const homeDir = os.homedir();

    if (shell.includes('bash')) {
      // Linux typically uses .bashrc, macOS uses .bash_profile
      if (Utils.isLinux()) {
        return [
          path.join(homeDir, '.bashrc'),
          path.join(homeDir, '.bash_profile'),
          path.join(homeDir, '.profile'),
        ];
      }
      return [
        path.join(homeDir, '.bash_profile'),
        path.join(homeDir, '.bashrc'),
        path.join(homeDir, '.profile'),
      ];
    }

    if (shell.includes('zsh')) {
      return [
        path.join(homeDir, '.zshrc'),
        path.join(homeDir, '.zprofile'),
        path.join(homeDir, '.zshenv'),
      ];
    }

    // Default to bash-style files
    return [
      path.join(homeDir, '.bashrc'),
      path.join(homeDir, '.bash_profile'),
      path.join(homeDir, '.profile'),
    ];
  },

  async installViaPkgMgr(pkg: string): Promise<void> {
    const $ = getPty();
    if (Utils.isLinux()) {
      await $.spawn(`sudo apt-get install -y ${pkg}`, { interactive: true, requiresRoot: true });
    }
  },

  getPrimaryShellRc(): string {
    const shell = process.env.SHELL || '';
    const homeDir = os.homedir();

    if (shell.includes('bash')) {
      // Linux typically uses .bashrc as primary, macOS uses .bash_profile
      return Utils.isLinux()
        ? path.join(homeDir, '.bashrc')
        : path.join(homeDir, '.bash_profile');
    }

    if (shell.includes('zsh')) {
      return path.join(homeDir, '.zshrc');
    }

    // Default to .bashrc
    return path.join(homeDir, '.bashrc');
  }
};
