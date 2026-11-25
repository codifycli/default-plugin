import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { GlobalVersionParameter } from '../../../utils/global-version-parameter.js';
import { PyenvConfig } from './pyenv.js';
import { PythonVersionsParameter } from './python-versions-parameter.js';

export class PyenvGlobalParameter extends GlobalVersionParameter<PyenvConfig> {
  constructor() {
    super(new PythonVersionsParameter());
  }

  protected async readGlobal(): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('pyenv global');
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return data.trim();
  }

  protected async setGlobal(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pyenv global ${version}`, { interactive: true });
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('pyenv global system', { interactive: true });
  }
}
