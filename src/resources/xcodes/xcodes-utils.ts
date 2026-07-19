import { getPty } from '@codifycli/plugin-core';

export const LATEST_VERSION_KEYWORD = 'latest';

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

/**
 * Resolves the "latest" sentinel to the newest installed Xcode version.
 * Returns the input unchanged if it isn't the "latest" sentinel.
 */
export async function resolveInstalledVersion(version: string): Promise<string | null> {
  if (version !== LATEST_VERSION_KEYWORD) return version;

  const $ = getPty();
  const { data } = await $.spawnSafe('xcodes installed', { interactive: true });
  const installed = parseInstalledVersions(data);
  return installed.at(-1) ?? null;
}
