import { getPty, ParameterSetting, Plan, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { NvmNodeVersionsParameter } from './node-versions-parameter.js';
import { NvmConfig } from './nvm.js';

export class NvmGlobalParameter extends StatefulParameter<NvmConfig, string>{
  private readonly versions = new NvmNodeVersionsParameter();

  getSettings(): ParameterSetting {
    return {
      type: 'version',
    }
  }

  override async refresh(desired: null | string, config: Partial<NvmConfig>): Promise<null | string> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe('nvm ls default --no-colors')

    if (status === SpawnStatus.ERROR) {
      return null;
    }

    const current = this.formatVersion(data);

    // "latest" / "lts" converge when the default is the version that keyword currently resolves to
    if (desired && current && this.versions.isAlias(desired)
      && (await this.versions.resolveKeyword(desired, config)) === current) {
      return desired;
    }

    return current;
  }

  override async add(valueToAdd: string, plan: Plan<NvmConfig>): Promise<void> {
    await this.setDefault(valueToAdd, plan.desiredConfig ?? {});
  }

  override async modify(newValue: string, _previousValue: string, plan: Plan<NvmConfig>): Promise<void> {
    await this.setDefault(newValue, plan.desiredConfig ?? {});
  }

  override async remove(valueToRemove: string): Promise<void> {
    console.warn(`Nvm does not allow removing the global default. NodeJS will still be ${valueToRemove}. Skipping...`)
  }

  private async setDefault(value: string, config: Partial<NvmConfig>): Promise<void> {
    const version = await this.versions.resolveKeyword(value, config);
    if (!version) {
      throw new Error(`Unable to resolve "${value}" to a Node.js version.`);
    }

    const $ = getPty();
    await $.spawn(`nvm alias default ${version}`, { interactive: true })
  }

  private formatVersion(output: string): null | string {
    return output?.replaceAll('->', '')
      ?.replaceAll(' ', '')
      ?.replaceAll('v', '')
      ?.replaceAll('*', '')
      ?.trim()
  }
}
