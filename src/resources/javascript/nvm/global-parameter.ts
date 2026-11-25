import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { GlobalVersionParameter } from '../../../utils/global-version-parameter.js';
import { NvmNodeVersionsParameter } from './node-versions-parameter.js';
import { NvmConfig } from './nvm.js';

export class NvmGlobalParameter extends GlobalVersionParameter<NvmConfig> {
  constructor() {
    super(new NvmNodeVersionsParameter());
  }

  protected async readGlobal(): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('nvm ls default --no-colors', { interactive: true });
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return data.replaceAll('->', '')
      .replaceAll(' ', '')
      .replaceAll('v', '')
      .replaceAll('*', '')
      .trim();
  }

  protected async setGlobal(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`nvm alias default ${version}`, { interactive: true });
  }

  override async remove(valueToRemove: string): Promise<void> {
    console.warn(`Nvm does not allow removing the global default. NodeJS will still be ${valueToRemove}. Skipping...`);
  }
}
