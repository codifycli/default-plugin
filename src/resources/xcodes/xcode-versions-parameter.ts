import { ArrayParameterSetting, ArrayStatefulParameter, Plan, getPty } from '@codifycli/plugin-core';

import { XcodesConfig } from './xcodes-resource.js';
import { LATEST_VERSION_KEYWORD, parseInstalledVersions, resolveInstalledVersion } from './xcodes-utils.js';

export class XcodeVersionsParameter extends ArrayStatefulParameter<XcodesConfig, string> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      // "latest" never matches a real version string returned by refresh() on its own;
      // refresh() below re-normalizes whichever installed version fulfilled "latest"
      // back into the literal string "latest" so the framework treats them as equal.
      isElementEqual: (desired, current) => desired === current,
    };
  }

  override async refresh(desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();
    const { data } = await $.spawnSafe('xcodes installed');
    const installed = parseInstalledVersions(data);
    return normalizeLatestKeyword(installed, desired ?? []);
  }

  override async addItem(version: string, plan: Plan<XcodesConfig>): Promise<void> {
    const $ = getPty();
    const { appleId, appleIdPassword } = plan.desiredConfig ?? {};

    const env: Record<string, string> = {};
    if (appleId) env['XCODES_USERNAME'] = appleId;
    if (appleIdPassword) env['XCODES_PASSWORD'] = appleIdPassword;

    const installArg = version === LATEST_VERSION_KEYWORD ? '--latest' : `"${version}"`;
    await $.spawn(`xcodes install ${installArg}`, {
      interactive: true,
      stdin: true,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    const installedVersion = await resolveInstalledVersion(version);
    if (!installedVersion) return;
    await $.spawn(`xcodes uninstall "${installedVersion}"`, { interactive: true });
  }
}

/**
 * Replaces whichever installed version fulfills the "latest" sentinel with the
 * literal string "latest" so the framework's equality check (desired === current)
 * treats them as converged, instead of endlessly re-adding/removing.
 */
function normalizeLatestKeyword(installed: string[], desired: string[]): string[] {
  if (!desired.includes(LATEST_VERSION_KEYWORD)) return installed;

  const unclaimed = installed.filter((v) => !desired.includes(v));
  if (unclaimed.length === 0) return installed;

  // xcodes installed lists oldest-to-newest; the newest unclaimed version is
  // the one that satisfies "latest".
  const latestMatch = unclaimed.at(-1)!;
  return installed.map((v) => (v === latestMatch ? LATEST_VERSION_KEYWORD : v));
}
