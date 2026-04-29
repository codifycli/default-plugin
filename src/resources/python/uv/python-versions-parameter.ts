import { ArrayParameterSetting, ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';

import { UvConfig } from './uv.js';

/**
 * uv python list --only-installed output example:
 *   cpython-3.12.3-macos-aarch64-none
 *   cpython-3.11.9-macos-aarch64-none
 *
 * We extract the version string (e.g. "3.12.3") from each line and match
 * against the user-specified prefix (e.g. "3.12").
 */
export class UvPythonVersionsParameter extends ArrayStatefulParameter<UvConfig, string> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      // desired "3.12" matches installed "3.12.3" via startsWith
      isElementEqual: (desired, current) => current.startsWith(desired),
    };
  }

  override async refresh(desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();

    const { status, data } = await $.spawnSafe('uv python list --only-installed');
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    const installedVersions = parseInstalledPythonVersions(data);

    // Replace full versions with the matching desired prefix so the framework
    // can treat them as equal (e.g. "3.12.3" → "3.12" when desired is "3.12").
    return normalizeToDesiredPrefixes(installedVersions, desired ?? []);
  }

  override async addItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`uv python install ${version}`, { interactive: true });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`uv python uninstall ${version}`, { interactive: true });
  }
}

/** Extract semver strings like "3.12.3" from lines such as "cpython-3.12.3-macos-aarch64-none" */
function parseInstalledPythonVersions(output: string): string[] {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/cpython-(\d+\.\d+(?:\.\d+)?)/);
      return match ? match[1] : null;
    })
    .filter((v): v is string => v !== null);
}

/**
 * For each installed full version (e.g. "3.12.3"), if a desired prefix matches
 * it (e.g. "3.12"), replace the full version entry with the prefix so the
 * framework sees them as equal.
 */
function normalizeToDesiredPrefixes(installed: string[], desired: string[]): string[] {
  return installed.map((fullVersion) => {
    const matchedPrefix = desired.find((prefix) => fullVersion.startsWith(prefix));
    return matchedPrefix ?? fullVersion;
  });
}
