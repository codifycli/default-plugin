import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { GoenvConfig } from './goenv.js';

export class GoenvGlobalParameter extends StatefulParameter<GoenvConfig, string> {
  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  override async refresh(): Promise<string | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('goenv global');
    if (status === SpawnStatus.ERROR) {
      return null;
    }
    return parseGlobalVersion(data);
  }

  override async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`goenv global ${valueToAdd}`, { interactive: true });
  }

  override async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`goenv global ${newValue}`, { interactive: true });
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('goenv global system', { interactive: true });
  }
}

function parseGlobalVersion(output: string): string | null {
  const version = output.trim();
  return version === 'system' ? null : version;
}
