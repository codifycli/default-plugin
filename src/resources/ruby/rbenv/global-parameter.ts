import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { RbenvConfig } from './rbenv.js';

export class RbenvGlobalParameter extends StatefulParameter<RbenvConfig, string> {
  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  override async refresh(): Promise<string | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('rbenv global');

    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return parseGlobalVersion(data);
  }

  override async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`rbenv global ${valueToAdd}`, { interactive: true });
  }

  override async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`rbenv global ${newValue}`, { interactive: true });
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('rbenv global system', { interactive: true });
  }
}

/**
 * Parse the output of `rbenv global`.
 * Returns null when rbenv reports "system" (no user-managed version set).
 */
function parseGlobalVersion(output: string): string | null {
  const version = output.trim();
  return version === 'system' ? null : version;
}
