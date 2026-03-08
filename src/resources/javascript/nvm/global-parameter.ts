import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { NvmConfig } from './nvm.js';

export class NvmGlobalParameter extends StatefulParameter<NvmConfig, string>{

  getSettings(): ParameterSetting {
    return {
      type: 'version',
    }
  }

  override async refresh(): Promise<null | string> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe('nvm ls default --no-colors')

    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return this.formatVersion(data);
  }

  override async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`nvm alias default ${valueToAdd}`, { interactive: true })
  }

  override async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`nvm alias default ${newValue}`, { interactive: true })
  }

  override async remove(valueToRemove: string): Promise<void> {
    console.warn(`Nvm does not allow removing the global default. NodeJS will still be ${valueToRemove}. Skipping...`)
  }

  private formatVersion(output: string): null | string {
    return output?.replaceAll('->', '')
      ?.replaceAll(' ', '')
      ?.replaceAll('v', '')
      ?.replaceAll('*', '')
      ?.trim()
  }
}
