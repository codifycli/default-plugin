import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { UvConfig } from './uv.js';

/**
 * Manages the global default Python version exposed on PATH via uv.
 *
 * `uv python install <version> --default` installs unversioned `python` and
 * `python3` symlinks into ~/.local/bin, making that version the system-wide
 * default outside of any project context.
 *
 * To detect the current default, we read the symlink at ~/.local/bin/python
 * and parse the cpython version string from the target path.
 */
export class UvGlobalParameter extends StatefulParameter<UvConfig, string> {
  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  override async refresh(): Promise<string | null> {
    const $ = getPty();

    // Check if ~/.local/bin/python exists and points to a uv-managed interpreter.
    // `readlink` resolves the symlink target; if it contains cpython we know it
    // was installed by uv with --default.
    const { status, data } = await $.spawnSafe('readlink ~/.local/bin/python');
    if (status === SpawnStatus.ERROR || !data.trim()) {
      return null;
    }

    const { status: versionStatus, data: versionData } = await $.spawnSafe('python --version');
    if (versionStatus === SpawnStatus.ERROR) {
      return null;
    }

    const match = versionData.trim().match(/Python\s+(\S+)/);
    return match ? match[1] ?? null : null;
  }

  override async add(version: string): Promise<void> {
    const $ = getPty();
    await $.spawnSafe(`uv python install ${version} --default`, { interactive: true });
    await $.spawnSafe('uv python update-shell', { interactive: true })
  }

  override async modify(newVersion: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`uv python install ${newVersion} --default`, { interactive: true });
  }

  override async remove(_version: string): Promise<void> {
    const $ = getPty();
    // uv has no "unset default" command. Remove the unversioned symlinks that
    // --default created in ~/.local/bin so `python` / `python3` no longer
    // resolve to this uv-managed interpreter. The versioned binary is left
    // intact because it may still be listed in pythonVersions.
    await $.spawnSafe('rm -f ~/.local/bin/python ~/.local/bin/python3');
  }
}
