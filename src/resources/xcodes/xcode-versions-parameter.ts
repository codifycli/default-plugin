import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { VersionsParameter } from '../../utils/versions-parameter.js';
import { XcodesConfig } from './xcodes-resource.js';
import { newestRelease, parseInstalledVersions } from './xcodes-utils.js';

export class XcodeVersionsParameter extends VersionsParameter<XcodesConfig> {
  protected readonly supportedAliases = ['latest'] as const;

  constructor() {
    super('xcodeVersions');
  }

  protected async listInstalled(): Promise<string[]> {
    const $ = getPty();
    const { data } = await $.spawnSafe('xcodes installed');
    return parseInstalledVersions(data);
  }

  // `xcodes list` fetches the available releases (no Apple ID needed). Betas / RCs are skipped, matching
  // `xcodes install --latest`. Falls back to the newest installed release.
  protected async resolveAlias(_alias: unknown, installed: string[]): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('xcodes list');
    const available = status === SpawnStatus.SUCCESS ? parseInstalledVersions(data) : [];

    return newestRelease(available) ?? newestRelease(installed);
  }

  protected async installVersion(version: string, config: Partial<XcodesConfig>): Promise<void> {
    const $ = getPty();
    const { appleId, appleIdPassword } = config;

    const env: Record<string, string> = {};
    if (appleId) env['XCODES_USERNAME'] = appleId;
    if (appleIdPassword) env['XCODES_PASSWORD'] = appleIdPassword;

    await $.spawn(`xcodes install "${version}"`, {
      interactive: true,
      stdin: true,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    });
  }

  protected async uninstallVersion(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`xcodes uninstall "${version}"`, { interactive: true });
  }
}
