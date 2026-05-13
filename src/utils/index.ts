import { getPty, Utils as CoreUtils } from '@codifycli/plugin-core';
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

  async isDirectoryOnPath(directory: string): Promise<boolean> {
    const $ = getPty();
    const { data: pathQuery } = await $.spawn('echo $PATH', { interactive: true });
    const lines = pathQuery.split(':');
    return lines.includes(directory);
  },
  
  shellEscape(arg: string): string {
    if (/[^\w/:=-]/.test(arg)) return arg.replaceAll(/([ !"#$%&'()*;<>?@[\\\]`{}~])/g, '\\$1')
    return arg;
  },
};
