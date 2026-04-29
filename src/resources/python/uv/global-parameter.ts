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

    // Symlink target is a path like .../cpython-3.12.3-.../bin/python3.12
    const match = data.trim().match(/cpython-(\d+\.\d+(?:\.\d+)?)/);

    return match ? match[1] : null;
  }

  override async add(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`uv python install ${version} --default`, { interactive: true });
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
