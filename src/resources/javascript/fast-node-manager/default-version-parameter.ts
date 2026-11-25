import { getPty, ParameterSetting, Plan, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { FnmConfig } from './fast-node-manager.js';
import { FnmNodeVersionsParameter } from './node-versions-parameter.js';

export class FnmDefaultVersionParameter extends StatefulParameter<FnmConfig, string> {
  private readonly versions = new FnmNodeVersionsParameter();

  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  override async refresh(desired: null | string, config: Partial<FnmConfig>): Promise<string | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('fnm list', { interactive: true });

    if (status === SpawnStatus.ERROR) {
      return null;
    }

    let current: null | string = null;
    for (const line of data.split('\n')) {
      if (line.includes('default')) {
        const match = line.match(/v?(\d+\.\d+\.\d+)/);
        if (match) {
          current = match[1];
          break;
        }
      }
    }

    // "latest" / "lts" converge when the default is the version that keyword currently resolves to
    if (desired && current && this.versions.isAlias(desired)
      && (await this.versions.resolveKeyword(desired, config)) === current) {
      return desired;
    }

    return current;
  }

  override async add(valueToAdd: string, plan: Plan<FnmConfig>): Promise<void> {
    await this.setDefault(valueToAdd, plan.desiredConfig ?? {});
  }

  override async modify(newValue: string, _previousValue: string, plan: Plan<FnmConfig>): Promise<void> {
    await this.setDefault(newValue, plan.desiredConfig ?? {});
  }

  override async remove(valueToRemove: string): Promise<void> {
    console.warn(`fnm does not support unsetting the default version. Node.js will remain at ${valueToRemove}. Skipping...`);
  }

  private async setDefault(value: string, config: Partial<FnmConfig>): Promise<void> {
    const version = await this.versions.resolveKeyword(value, config);
    if (!version) {
      throw new Error(`Unable to resolve "${value}" to a Node.js version.`);
    }

    const $ = getPty();
    await $.spawn(`fnm default ${version}`, { interactive: true });
  }
}
