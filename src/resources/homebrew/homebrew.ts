import {
  CreatePlan,
  FileUtils,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  getPty,
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { untildify } from '../../utils/untildify.js';
import { CasksParameter } from './casks-parameter.js'
import { FormulaeParameter } from './formulae-parameter.js';
import HomebrewSchema from './homebrew-schema.json'
import { TapsParameter } from './tap-parameter.js';

export interface HomebrewConfig extends ResourceConfig {
  casks?: string[];
  directory?: string;
  formulae?: string[];
  taps?: string[];
  skipAlreadyInstalledCasks: boolean;
  onlyPlanUserInstalled: boolean
}

export class HomebrewResource extends Resource<HomebrewConfig> {

  override getSettings(): ResourceSettings<HomebrewConfig> {
    return {
      schema: HomebrewSchema,
      operatingSystems: [OS.Darwin, OS.Linux],
      id: 'homebrew',
      parameterSettings: {
        taps: { type: 'stateful', definition: new TapsParameter(), order: 1 },
        formulae: { type: 'stateful', definition: new FormulaeParameter(), order: 2 },
        casks: { type: 'stateful', definition: new CasksParameter(), order: 3 },
        directory: { type: 'directory' },
        skipAlreadyInstalledCasks: { type: 'boolean', default: true, setting: true },
        onlyPlanUserInstalled: { type: 'boolean', default: true, setting: true },
      }
    };
  }

  override async refresh(parameters: Partial<HomebrewConfig>): Promise<Partial<HomebrewConfig> | null> {
    const $ = getPty();

    const homebrewInfo = await $.spawnSafe('brew config');
    if (homebrewInfo.status === SpawnStatus.ERROR) {
      return null;
    }

    const result: Partial<HomebrewConfig> = {}
    if (parameters.directory) {
      result.directory = this.getCurrentLocation(homebrewInfo.data);
    }

    return result;
  }

  override async create(plan: CreatePlan<HomebrewConfig>): Promise<void> {
    const $ = getPty();

    if (plan.desiredConfig.directory) {
      return this.installBrewInCustomDir(plan.desiredConfig.directory)
    }

    await $.spawn(
      '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      { stdin: true, env: { NONINTERACTIVE: 1 } }
    )

    const brewPath = Utils.isLinux() ? '/home/linuxbrew/.linuxbrew/bin/brew' : '/opt/homebrew/bin/brew';
    await FileUtils.addToShellRc(`eval "$(${brewPath} shellenv)"`);

    // TODO: Add a check here to see if homebrew is writable
    //  Either add a warning or a parameter to edit the permissions on /opt/homebrew
  }

  override async destroy(): Promise<void> {
    const $ = getPty();
    const homebrewInfo = await $.spawn('brew config', { interactive: true });
    const homebrewDirectory = this.getCurrentLocation(homebrewInfo.data)

    if (homebrewDirectory === '/opt/homebrew') {
      await $.spawnSafe(
        '/bin/bash -c "$(/usr/bin/curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)"',
        { stdin: true, env: { NONINTERACTIVE: 1 } }
      )
    } else {
      await $.spawn(`rm -rf ${homebrewDirectory}`, { requiresRoot: true });
    }

    // Delete eval from .zshrc
    await FileUtils.removeLineFromShellRc(`eval "$(${homebrewDirectory}/bin/brew shellenv)"`)
  }

  private async installBrewInCustomDir(dir: string): Promise<void> {
    const $ = getPty();
    const absoluteDir = path.resolve(untildify(dir))

    try {
      await fs.access(absoluteDir)
    } catch {
      await fs.mkdir(absoluteDir, { recursive: true });
    }

    // Un-tar brew in a custom dir: https://github.com/Homebrew/brew/blob/664d0c67d5947605c914c4c56ebcfaa80cb6eca0/docs/Installation.md#untar-anywhere
    // the location where brew is first activated is where it will be installed
    await $.spawn('curl -L https://github.com/Homebrew/brew/tarball/master | tar xz --strip 1', { cwd: absoluteDir })

    // Activate brew to install it in the directory
    await $.spawn(
      './brew config', {
        cwd: path.join(absoluteDir, '/bin'),
        interactive: true
      })

    // Update shell startup scripts
    await FileUtils.addToShellRc(`eval "$(${absoluteDir}/bin/brew shellenv)"`);
  }

  // Ex:
  // HOMEBREW_VERSION: 4.2.9-114-ge9cb65b
  // ORIGIN: https://github.com/Homebrew/brew
  private getCurrentLocation(homebrewInfo: string) {
    const homebrewPrefix = homebrewInfo.split('\n')
      .find((x) => x.includes('HOMEBREW_PREFIX'))
    if (!homebrewPrefix) {
      throw new Error(`Homebrew prefix not found in config \n${homebrewInfo}`)
    }

    return homebrewPrefix.split(':')[1].trim()
  }
}
