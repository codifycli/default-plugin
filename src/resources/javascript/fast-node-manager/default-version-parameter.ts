import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { FnmConfig } from './fast-node-manager.js';

export class FnmDefaultVersionParameter extends StatefulParameter<FnmConfig, string> {
  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  override async refresh(): Promise<string | null> {
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

  override async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`fnm default ${valueToAdd}`, { interactive: true });
  }

  override async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`fnm default ${newValue}`, { interactive: true });
  }

  override async remove(valueToRemove: string): Promise<void> {
    console.warn(`fnm does not support unsetting the default version. Node.js will remain at ${valueToRemove}. Skipping...`);
  }
}
