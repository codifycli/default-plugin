import { CreatePlan, DestroyPlan, ExampleConfig, RefreshContext, Resource, ResourceSettings, getPty, Utils } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
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
    if (parameters.version || context.commandType === 'import') {
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
    const actual = pnpmLocation.trim().toLowerCase();

    const expectedPnpmBin = path.join(expectedPnpmHome, 'bin', 'pnpm').toLowerCase();
    const expectedPnpmBinFallback = path.join(expectedPnpmHome, 'pnpm').toLowerCase();
    const isInstalledByScript = actual === expectedPnpmBin || actual === expectedPnpmBinFallback;
    const isInstalledByNpm = actual.includes('node_modules/.bin/pnpm') || actual.includes('node_modules/pnpm');
    const isInstalledByHomebrew = actual.includes('/homebrew/') || actual.includes('/linuxbrew/') || actual.includes('/opt/homebrew/');

    if (isInstalledByScript) {
      const { data: pnpmHome } = await $.spawnSafe('echo $PNPM_HOME', { interactive: true });
      await fs.rm(pnpmHome?.trim() || expectedPnpmHome, { recursive: true, force: true });

      const shellRc = Utils.getPrimaryShellRc();
      await FileUtils.removeLineFromStartupFile('# pnpm')
      await FileUtils.removeLineFromStartupFile(`export PNPM_HOME="${expectedPnpmHome}"`)
      await FileUtils.removeFromFile(shellRc,
`case ":$PATH:" in
  *":$PNPM_HOME/bin:"*) ;;
  *) export PATH="$PNPM_HOME/bin:$PATH" ;;
esac`)
      await FileUtils.removeFromFile(shellRc,
`case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac`)
      await FileUtils.removeLineFromStartupFile('# pnpm end')
    } else if (isInstalledByNpm) {
      await $.spawn('npm uninstall -g pnpm', { interactive: true });
    } else if (isInstalledByHomebrew) {
      await Utils.uninstallViaPkgMgr('pnpm');
    } else {
      throw new Error(`pnpm is installed at an unrecognized location: ${actual}. Please uninstall manually and re-run Codify`);
    }

    console.log('Successfully uninstalled pnpm');
  }
}
