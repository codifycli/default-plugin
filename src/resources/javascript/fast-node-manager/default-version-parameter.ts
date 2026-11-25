import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { GlobalVersionParameter } from '../../../utils/global-version-parameter.js';
import { FnmConfig } from './fast-node-manager.js';
import { FnmNodeVersionsParameter } from './node-versions-parameter.js';

export class FnmDefaultVersionParameter extends GlobalVersionParameter<FnmConfig> {
  constructor() {
    super(new FnmNodeVersionsParameter());
  }

  protected async readGlobal(): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('fnm list', { interactive: true });
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    for (const line of data.split('\n')) {
      if (line.includes('default')) {
        const match = line.match(/v?(\d+\.\d+\.\d+)/);
        if (match) return match[1];
      }
    }

    return null;
  }

  protected async setGlobal(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`fnm default ${version}`, { interactive: true });
  }

  override async remove(valueToRemove: string): Promise<void> {
    console.warn(`fnm does not support unsetting the default version. Node.js will remain at ${valueToRemove}. Skipping...`);
  }
}
