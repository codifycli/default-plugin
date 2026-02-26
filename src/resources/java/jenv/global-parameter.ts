import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { JenvConfig } from './jenv.js';

export class JenvGlobalParameter extends StatefulParameter<JenvConfig, string>{

  getSettings(): ParameterSetting {
    return {
      type: 'version'
    }
  }

  override async refresh(): Promise<null | string> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe('jenv global')
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return data.trim();
  }

  override async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`jenv global ${valueToAdd}`, { interactive: true })
  }

  override async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`jenv global ${newValue}`, { interactive: true })
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('jenv global system', { interactive: true })
  }
}
