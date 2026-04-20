import { ExampleConfig, getPty, Resource, ResourceSettings, SpawnStatus, Utils } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import { PyenvGlobalParameter } from './global-parameter.js';
import Schema from './pyenv-schema.json';
import { PythonVersionsParameter } from './python-versions-parameter.js';

export interface PyenvConfig extends ResourceConfig {
  global?: string,
  pythonVersions?: string[],
  // TODO: Add option here to use homebrew to install instead. Default to true. Maybe add option to set default values to resource config.
}

const defaultConfig: Partial<PyenvConfig> = {
  pythonVersions: [],
}

const exampleBasic: ExampleConfig = {
  title: 'Install pyenv with a Python version',
  description: 'Install pyenv and pin a Python version as the global default.',
  configs: [{
    type: 'pyenv',
    pythonVersions: ['3.12'],
    global: '3.12',
  }]
}

const exampleMultiVersion: ExampleConfig = {
  title: 'Install pyenv with multiple Python versions',
  description: 'Install pyenv with several Python versions available, pinning one as the global default.',
  configs: [{
    type: 'pyenv',
    pythonVersions: ['3.12', '3.11', '3.10'],
    global: '3.12',
  }]
}

export class PyenvResource extends Resource<PyenvConfig> {
  getSettings(): ResourceSettings<PyenvConfig> {
    return {
      id: 'pyenv',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleMultiVersion,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        global: { type: 'stateful', definition: new PyenvGlobalParameter(), order: 2 },
        pythonVersions: { type: 'stateful', definition: new PythonVersionsParameter(), order: 1, },
      },
    }
  }

  override async refresh(): Promise<Partial<PyenvConfig> | null> {
    const $ = getPty();

    const pyenvVersion = await $.spawnSafe('pyenv --version')
    if (pyenvVersion.status === SpawnStatus.ERROR) {
      return null
    }

    return {};
  }

  override async create(): Promise<void> {
    const $ = getPty();

    // Pyenv directory exists already but PYENV_ROOT variable is not set. Most likely pyenv is installed but not initialized
    if (fs.existsSync(path.join(os.homedir(), '.pyenv'))
      && (await $.spawnSafe('[ -z $PYENV_ROOT ]', { interactive: true })).status === SpawnStatus.SUCCESS
    ) {
      await this.addPyenvInitialization();

      // Check if pyenv is installed properly, if it is then return. If not destroy the current
      // installation so it can be re-installed.
      if (await this.isValidInstall()) {
        return;
      } else {
        await this.destroy();
      }
    }

    if (Utils.isMacOS()) {
      await Utils.installViaPkgMgr('openssl readline sqlite3 xz tcl-tk@8 libb2 zstd zlib pkgconfig');
    } else if (Utils.isLinux()) {
      await Utils.installViaPkgMgr('make build-essential libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev curl git libncursesw5-dev xz-utils tk-dev libxml2-dev libxmlsec1-dev libffi-dev liblzma-dev');
    }

    await $.spawn('curl https://pyenv.run | bash', { interactive: true })

    // Add to startup script
    await this.addPyenvInitialization();
  }

  override async destroy(): Promise<void> {
    const $ = getPty();

    await $.spawn('rm -rf $(pyenv root)', { interactive: true });
    await $.spawn('rm -rf $HOME/.pyenv');

    await FileUtils.removeLineFromStartupFile('export PYENV_ROOT="$HOME/.pyenv"')
    await FileUtils.removeLineFromStartupFile('[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"')
    await FileUtils.removeLineFromStartupFile('eval "$(pyenv init -)"')
  }

  private async addPyenvInitialization(): Promise<void> {
    await FileUtils.addAllToStartupFile([
      'export PYENV_ROOT="$HOME/.pyenv"',
      '[[ -d $PYENV_ROOT/bin ]] && export PATH="$PYENV_ROOT/bin:$PATH"',
      'eval "$(pyenv init -)"'
    ]);
  }

  // TODO: Need to support bash in addition to zsh here
  private async isValidInstall(): Promise<boolean> {
    const $ = getPty();
    const { data: doctor } = await $.spawnSafe('pyenv doctor', { interactive: true })
    return doctor.includes('Congratulations! You are ready to build pythons!');
  }
}
