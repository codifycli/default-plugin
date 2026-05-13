import { ArrayParameterSetting, ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';

import { NvmConfig } from './nvm.js';

export class NvmNodeVersionsParameter extends ArrayStatefulParameter<NvmConfig, string> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      isElementEqual: (desired, current) => current.includes(desired),
    }
  }

  override async refresh(desired: null | string[]): Promise<null | string[]> {
    const $ = getPty()

    const { data } = await $.spawnSafe('nvm ls --no-colors --no-alias')

    const versions = data.split(/\n/)
      .map((l) =>
        l.replaceAll(' ', '')
          .replaceAll('->', '')
          .replaceAll('*', '')
          .replaceAll('v', '')
          ?.trim()
      ).filter(Boolean)
      .filter((v) => v !== 'system');

    // To make matching easier, we will replace the elements in
    // current with what we currently have installed. This is because nvm has weird
    // matching logic that we cannot replicate
    for (const desiredVersion of desired ?? []) {
      const { status, data } = await $.spawnSafe(`nvm ls ${desiredVersion} --no-colors`);

      if (status !== SpawnStatus.SUCCESS) {
        continue;
      }

      const matchedVersion = data.replaceAll('->', '')
        .replaceAll('v', '')
        .replaceAll('*', '')
        ?.trim();

      if (versions.includes(matchedVersion)) {
        const index = versions.indexOf(matchedVersion);
        versions.splice(index, 1, desiredVersion);
      }
    }

    return versions;
  }

  override async addItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`nvm install ${version}`, { interactive: true });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`nvm uninstall ${version}`, { interactive: true });
  }
}
