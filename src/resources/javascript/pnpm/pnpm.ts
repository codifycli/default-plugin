import { CreatePlan, DestroyPlan, ExampleConfig, RefreshContext, Resource, ResourceSettings, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import { Utils } from '../../../utils/index.js';
import { PnpmGlobalEnvStatefulParameter } from './pnpm-global-env-stateful-parameter.js';
import schema from './pnpm-schema.json';

export interface PnpmConfig extends ResourceConfig {
  version?: string;
  globalEnvNodeVersion?: string;
}

const exampleWithNode: ExampleConfig = {
  title: 'Install pnpm with a global Node.js version',
  description: 'Install a specific version of pnpm and activate a global Node.js version via pnpm env.',
  configs: [{
    type: 'pnpm',
    version: '10',
    globalEnvNodeVersion: '22.0.0',
  }]
}

export class Pnpm extends Resource<PnpmConfig> {
  getSettings(): ResourceSettings<PnpmConfig> {
    return {
      id: 'pnpm',
      exampleConfigs: {
        example1: exampleWithNode,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        version: { type: 'version' },
        globalEnvNodeVersion: { type: 'stateful', definition: new PnpmGlobalEnvStatefulParameter() }
      }
    }
  }

  async refresh(parameters: Partial<PnpmConfig>, context: RefreshContext<PnpmConfig>): Promise<Partial<PnpmConfig> | Partial<PnpmConfig>[] | null> {
    const pty = getPty();

    const { status } = await pty.spawnSafe('which pnpm');
    if (status === 'error') {
      return null;
    }

    // Return a specific version if it's required from the user.
    if (parameters.version) {
      const { data } = await pty.spawn('pnpm --version');
      return { version: data }
    }
 
      return parameters;
    
  }

  async create(plan: CreatePlan<PnpmConfig>): Promise<void> {
    const $ = getPty();
    const specificVersion = plan.desiredConfig.version;

    specificVersion
      ? await $.spawn(`curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=${specificVersion} sh -`, { interactive: true })
      : await $.spawn('curl -fsSL https://get.pnpm.io/install.sh | sh -', { interactive: true })
  }

  async destroy(plan: DestroyPlan<PnpmConfig>): Promise<void> {
    const $ = getPty();

    const expectedPnpmHome = Utils.isMacOS()
      ? path.join(os.homedir(), 'Library', 'pnpm')
      : path.join(os.homedir(), '.local', 'share', 'pnpm');

    const { data: pnpmLocation } = await $.spawn('which pnpm', { interactive: true });
    if (pnpmLocation.trim().toLowerCase() !== path.join(expectedPnpmHome, 'pnpm').trim().toLowerCase()) {
      throw new Error('pnpm was installed outside of Codify. Please uninstall manually and re-run Codify');
    }

    const { data: pnpmHome } = await $.spawnSafe('echo $PNPM_HOME', { interactive: true });
    if (!pnpmHome) {
      throw new Error('$PNPM_HOME variable is not set. Unable to determine how to uninstall pnpm. Please uninstall manually and re-run Codify.')
    }

    await fs.rm(pnpmHome, { recursive: true, force: true });
    console.log('Successfully uninstalled pnpm');

    const shellRc = Utils.getPrimaryShellRc();
    await FileUtils.removeLineFromStartupFile('# pnpm')
    await FileUtils.removeLineFromStartupFile(`export PNPM_HOME="${expectedPnpmHome}"`)
    await FileUtils.removeFromFile(shellRc,
`case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac`)
    await FileUtils.removeLineFromStartupFile('# pnpm end')
  }
}
