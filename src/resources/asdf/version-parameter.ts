import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { isStableVersion, newestVersion } from '../../utils/version-aliases.js';
import { VersionsParameter } from '../../utils/versions-parameter.js';
import { AsdfPluginConfig } from './asdf-plugin.js';

// Only "latest" is handled generically. Other keywords (ex: "lts" for asdf-nodejs) are plugin specific and are passed
// straight through to asdf like any other version string.
export class AsdfPluginVersionsParameter extends VersionsParameter<AsdfPluginConfig> {
  protected readonly supportedAliases = ['latest'] as const;

  constructor() {
    super('versions');
  }

  protected async listInstalled(config: Partial<AsdfPluginConfig>): Promise<null | string[]> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe(`asdf list ${config.plugin}`);
    if (status === SpawnStatus.ERROR || data.includes('No versions installed') || data.includes('No compatible versions installed')) {
      return null;
    }

    return data.split(/\n/)
      .map((l) => l.replaceAll('*', '').trim())
      .filter(Boolean);
  }

  // `asdf latest` queries the plugin's remote version list. Falls back to the newest installed version.
  protected async resolveAlias(_alias: unknown, installed: string[], config: Partial<AsdfPluginConfig>): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe(`asdf latest ${config.plugin}`);
    const latest = data.trim();

    if (status === SpawnStatus.SUCCESS && latest && !latest.includes(' ')) {
      return latest;
    }

    return newestVersion(installed, isStableVersion);
  }

  protected async installVersion(version: string, config: Partial<AsdfPluginConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`asdf install ${config.plugin} ${version}`, { interactive: true });
  }

  protected async uninstallVersion(version: string, config: Partial<AsdfPluginConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`asdf uninstall ${config.plugin} ${version}`, { interactive: true });
  }
}
