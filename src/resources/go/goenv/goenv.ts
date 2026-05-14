import {
  ExampleConfig,
  FileUtils,
  getPty,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import os from 'node:os';
import path from 'node:path';

import { GoenvGlobalParameter } from './global-parameter.js';
import { GoVersionsParameter } from './go-versions-parameter.js';

const GOENV_ROOT = path.join(os.homedir(), '.goenv');
const GOENV_ROOT_EXPORT = 'export GOENV_ROOT="$HOME/.goenv"';
const GOENV_PATH_EXPORT = 'export PATH="$GOENV_ROOT/bin:$PATH"';
const GOENV_INIT = 'eval "$(goenv init -)"';

const schema = z
  .object({
    goVersions: z
      .array(z.string())
      .describe('Go versions to install via goenv (e.g. ["1.22.0", "1.21.5"])')
      .optional(),
    global: z
      .string()
      .describe('The global Go version set by goenv.')
      .optional(),
  })
  .describe('goenv resource — install and manage multiple Go versions');

export type GoenvConfig = z.infer<typeof schema>;

const defaultConfig: Partial<GoenvConfig> = {
  goVersions: [],
};

const exampleBasic: ExampleConfig = {
  title: 'Install goenv with a global Go version',
  description: 'Install goenv, download Go 1.22.0, and set it as the default global version.',
  configs: [
    {
      type: 'goenv',
      goVersions: ['1.22.0'],
      global: '1.22.0',
    },
  ],
};

const exampleMultiVersion: ExampleConfig = {
  title: 'Manage multiple Go versions',
  description: 'Install goenv with multiple Go versions for cross-version testing, setting the latest as the default.',
  configs: [
    {
      type: 'goenv',
      goVersions: ['1.21.0', '1.22.0', '1.23.0'],
      global: '1.23.0',
    },
  ],
};

export class GoenvResource extends Resource<GoenvConfig> {
  getSettings(): ResourceSettings<GoenvConfig> {
    return {
      id: 'goenv',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleMultiVersion,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        goVersions: { type: 'stateful', definition: new GoVersionsParameter(), order: 1 },
        global: { type: 'stateful', definition: new GoenvGlobalParameter(), order: 2 },
      },
    };
  }

  override async refresh(): Promise<Partial<GoenvConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('goenv --version');
    if (status === SpawnStatus.SUCCESS) return {};

    // goenv may be installed via git clone but not yet on PATH in the current session
    const { status: binStatus } = await $.spawnSafe(
      `test -f ${path.join(GOENV_ROOT, 'bin', 'goenv')}`
    );
    return binStatus === SpawnStatus.SUCCESS ? {} : null;
  }

  override async create(): Promise<void> {
    if (Utils.isMacOS()) {
      await installOnMacOS();
    } else {
      await installOnLinux();
    }
  }

  override async destroy(): Promise<void> {
    if (Utils.isMacOS()) {
      await uninstallOnMacOS();
    } else {
      await uninstallOnLinux();
    }
  }
}

async function installOnMacOS(): Promise<void> {
  const $ = getPty();
  await $.spawn('brew install goenv', {
    interactive: true,
    env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
  });
  await FileUtils.addToShellRc(GOENV_INIT);
}

async function installOnLinux(): Promise<void> {
  await Utils.installViaPkgMgr('git');

  const $ = getPty();
  await $.spawn(`git clone https://github.com/go-nv/goenv.git ${GOENV_ROOT}`, {
    interactive: true,
  });

  await FileUtils.addAllToShellRc([GOENV_ROOT_EXPORT, GOENV_PATH_EXPORT, GOENV_INIT]);
}

async function uninstallOnMacOS(): Promise<void> {
  const $ = getPty();
  await $.spawnSafe('brew uninstall goenv', {
    env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
  });
  await removeGoenvFromShellRc([GOENV_INIT]);
}

async function uninstallOnLinux(): Promise<void> {
  const $ = getPty();
  await $.spawnSafe(`rm -rf ${GOENV_ROOT}`);
  await removeGoenvFromShellRc([GOENV_ROOT_EXPORT, GOENV_PATH_EXPORT, GOENV_INIT]);
}

async function removeGoenvFromShellRc(lines: string[]): Promise<void> {
  const shellRc = Utils.getPrimaryShellRc();
  if (!(await FileUtils.fileExists(shellRc))) {
    return;
  }
  for (const line of lines) {
    await FileUtils.removeLineFromShellRc(line);
  }
}
