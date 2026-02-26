import { getPty, Resource, ResourceSettings, SpawnStatus } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';
import * as os from 'node:os';

import { FileUtils } from '../../../utils/file-utils.js';
import { Utils } from '../../../utils/index.js';
import { NvmGlobalParameter } from './global-parameter.js';
import { NvmNodeVersionsParameter } from './node-versions-parameter.js';
import Schema from './nvm-schema.json';

export interface NvmConfig extends ResourceConfig {
  global?: string,
  nodeVersions?: string[],
}

export class NvmResource extends Resource<NvmConfig> {

  getSettings(): ResourceSettings<NvmConfig> {
    return {
      id: 'nvm',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        global: { type: 'stateful', definition: new NvmGlobalParameter(), order: 2 },
        nodeVersions: { type: 'stateful', definition: new NvmNodeVersionsParameter(), order: 1 },
      },
    }
  }

  override async refresh(): Promise<Partial<NvmConfig> | null> {
    const $ = getPty()

    const nvmQuery = await $.spawnSafe('command -v nvm')
    if (nvmQuery.status === SpawnStatus.ERROR) {
      return null
    }

    return {};
  }

  override async create(): Promise<void> {
    const $ = getPty();
    // Node installer was previously used.
    const { data } = await $.spawn('echo $npm_config_prefix', { interactive: true })
    if (data.trim() !== '') {
      await FileUtils.addToStartupFile('unset npm_config_prefix');
    }

    const { data: installResult } = await $.spawn('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash', { interactive: true })

    // Nvm doesn't handle if the init string is commented out
    // This check first checks that nvm detects the init string is there but nvm itself is still not present
    const shellRc = Utils.getPrimaryShellRc();
    if (installResult.includes(`nvm source string already in ${shellRc}`)
      && (await $.spawnSafe('which nvm', { interactive: true })).status === SpawnStatus.ERROR
    ) {
      await FileUtils.addAllToStartupFile([
        'export NVM_DIR="$HOME/.nvm"',
        '[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"'
      ])
    }
  }

  override async destroy(): Promise<void> {
    const $ = getPty();
    // eslint-disable-next-line no-template-curly-in-string
    const { data: nvmDir } = await $.spawn('echo "${NVM_DIR:-~/.nvm}"', { interactive: true });
    await $.spawn('nvm unload', { interactive: true });
    await $.spawn(`rm -rf ${nvmDir.trim()}`, { cwd: os.homedir() });

    await FileUtils.removeLineFromStartupFile('export NVM_DIR="$HOME/.nvm"')
    await FileUtils.removeLineFromStartupFile('[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"  # This loads nvm')
    await FileUtils.removeLineFromStartupFile('[ -s "$NVM_DIR/bash_completion" ] && \\. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion')
  }
}
