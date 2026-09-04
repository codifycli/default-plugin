import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { PYENV_INIT_INLINE, PyenvConfig } from './pyenv.js';

export class PyenvGlobalParameter extends StatefulParameter<PyenvConfig, string>{

  getSettings(): ParameterSetting {
    return {
      type: 'version'
    }
  }

  override async refresh(): Promise<null | string> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe(`${PYENV_INIT_INLINE} pyenv global`, { interactive: true })
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return data.trim();
  }

  override async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`${PYENV_INIT_INLINE} pyenv global ${valueToAdd}`, { interactive: true })
  }

  override async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`${PYENV_INIT_INLINE} pyenv global ${newValue}`, { interactive: true })
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn(`${PYENV_INIT_INLINE} pyenv global system`, { interactive: true })
  }
}
