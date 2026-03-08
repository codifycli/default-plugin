import { ParameterSetting, StatefulParameter, getPty } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';

import { FileUtils } from '../../../utils/file-utils.js';
import { PnpmConfig } from './pnpm.js';

export class PnpmGlobalEnvStatefulParameter extends StatefulParameter<PnpmConfig, string> {

  getSettings(): ParameterSetting {
    return {
      type: 'version',
    }
  }

  async refresh(): Promise<null | string> {
    const pty = getPty()

    const { data: path } = await pty.spawnSafe('echo $PNPM_HOME/node')
    if (!path || !(await FileUtils.fileExists(path))) {
      return null;
    }

    const { data: version } = await pty.spawn(`${path} -v`)
    return version.trim().slice(1);
  }

  async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pnpm env use --global ${valueToAdd}`, { interactive: true });
  }

  async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pnpm env use --global ${newValue}`, { interactive: true })
  }

  async remove(): Promise<void> {
    const $ = getPty();
    const { data: path } = await $.spawn('echo $PNPM_HOME/nodejs', { interactive: true })
    await fs.rm(path!, { recursive: true, force: true });
  }
}
