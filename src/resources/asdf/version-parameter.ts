import { ArrayStatefulParameter, getPty, Plan, SpawnStatus } from '@codifycli/plugin-core';

import { AsdfPluginConfig } from './asdf-plugin.js';

export class AsdfPluginVersionsParameter extends ArrayStatefulParameter<AsdfPluginConfig, string> {

  async refresh(desired: null | string[], config: Partial<AsdfPluginConfig>): Promise<null | string[]> {
    const $ = getPty();

    const versions = await $.spawnSafe(`asdf list ${config.plugin}`);
    if (versions.status === SpawnStatus.ERROR || versions.data.trim() === 'No versions installed') {
      return null;
    }

    const latest = desired?.includes('latest')
      ? (await $.spawn(`asdf latest ${config.plugin}`)).data.trim()
      : null;

    return versions.data.split(/\n/)
      .map((l) => l.trim())
      .map((l) => l.replaceAll( '*', ''))
      .map((l) => l.trim() === latest ? 'latest' : l)
      .filter(Boolean);
  }

  async addItem(item: string, plan: Plan<AsdfPluginConfig>): Promise<void> {
    const pty = getPty();
    await pty.spawn(`asdf install ${plan.desiredConfig?.plugin} ${item}`, { interactive: true });
  }

  async removeItem(item: string, plan: Plan<AsdfPluginConfig>): Promise<void> {
    const pty = getPty();
    await pty.spawn(`asdf uninstall ${plan.currentConfig?.plugin} ${item}`, { interactive: true });
  }

}
