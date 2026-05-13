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

    const { data: nodejsDir } = await pty.spawnSafe('echo $PNPM_HOME/bin', { interactive: true })
    if (!nodejsDir?.trim() || !(await FileUtils.dirExists(nodejsDir.trim()))) {
      return null;
    }

    const nodeBin = `${nodejsDir.trim()}/node`
    if (!(await FileUtils.fileExists(nodeBin))) {
      return null;
    }

    const { data: version } = await pty.spawn(`${nodeBin} -v`)
    return version.trim().replace(/^v/, '');
  }

  async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pnpm runtime set node -g ${valueToAdd}`, { interactive: true });
  }

  async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pnpm runtime set node -g ${newValue}`, { interactive: true })
  }

  async remove(): Promise<void> {
    const $ = getPty();
    const { data: nodejsDir } = await $.spawn('echo $PNPM_HOME/nodejs', { interactive: true })
    await fs.rm(nodejsDir.trim(), { recursive: true, force: true });
  }
}
