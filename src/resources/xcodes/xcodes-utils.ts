import { getPty } from '@codifycli/plugin-core';

import { isStableVersion, newestVersion } from '../../utils/version-aliases.js';

export const LATEST_VERSION_KEYWORD = 'latest';

/**
 * Parses `xcodes installed` / `xcodes list` output (`16.2 (16C5032a) (Installed, Selected)`) into version names
 * (`16.2`, `16.3 Beta 2`).
 */
export function parseInstalledVersions(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s+\([^)]+\)/);
      return match ? match[1].trim() : null;
    })
    .filter((v): v is string => v !== null);
}

/** Newest non beta / RC release in a list of xcodes version names. */
export function newestRelease(versions: string[]): null | string {
  return newestVersion(versions, isStableVersion);
}

/**
 * Resolves the "latest" sentinel to the newest installed Xcode version.
 * Returns the input unchanged if it isn't the "latest" sentinel.
 */
export async function resolveInstalledVersion(version: string): Promise<string | null> {
  if (version !== LATEST_VERSION_KEYWORD) return version;

  const $ = getPty();
  const { data } = await $.spawnSafe('xcodes installed', { interactive: true });
  const installed = parseInstalledVersions(data);
  return newestRelease(installed) ?? installed.at(-1) ?? null;
}
