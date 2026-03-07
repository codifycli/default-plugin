import { CreatePlan, Resource, ResourceSettings, SpawnStatus, getPty } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';
import { Utils } from '../../utils/index.js';
import { MacportsInstallParameter, PortPackage } from './install-parameter.js';
import schema from './macports-schema.json';

const MACPORTS_DOWNLOAD_LINKS: Record<string, string> = {
  '26': 'https://github.com/macports/macports-base/releases/download/v2.11.6/MacPorts-2.11.6-26-Tahoe.pkg',
  '15': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-15-Sequoia.pkg',
  '14': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-14-Sonoma.pkg',
  '13': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-13-Ventura.pkg',
  '12': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-12-Monterey.pkg',
  '11': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-11-BigSur.pkg',
  '10': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-10.15-Catalina.pkg',
  '9': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-10.14-Mojave.pkg',
  '8': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-10.13-HighSierra.pkg',
  '7': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-10.12-Sierra.pkg',
  '6': 'https://github.com/macports/macports-base/releases/download/v2.10.5/MacPorts-2.10.5-10.11-ElCapitan.pkg',
}

export interface MacportsConfig extends ResourceConfig {
  install: Array<PortPackage | string>;
}

export class MacportsResource extends Resource<MacportsConfig> {

  override getSettings(): ResourceSettings<MacportsConfig> {
    return {
      id: 'macports',
      operatingSystems: [OS.Darwin],
      schema,
      parameterSettings: {
        install: { type: 'stateful', definition: new MacportsInstallParameter() }
      }
    };
  }

  override async refresh(parameters: Partial<MacportsConfig>): Promise<Partial<MacportsConfig> | null> {
    const $ = getPty();

    const homebrewInfo = await $.spawnSafe('which port');
    if (homebrewInfo.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(plan: CreatePlan<MacportsConfig>): Promise<void> {
    const $ = getPty();
    const macOSVersion = (await $.spawn('sw_vers --productVersion'))?.data?.split('.')?.at(0);
    if (!macOSVersion) {
      throw new Error('Unable to determine macOS version');
    }

    const installerUrl = MACPORTS_DOWNLOAD_LINKS[macOSVersion];
    if (!installerUrl) {
      throw new Error(`Your current macOS version ${macOSVersion} is not supported. Only ${Object.keys(MACPORTS_DOWNLOAD_LINKS)} is supported`);
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-macports'));
    const installerPath = path.join(tmpDir, 'installer.pkg')

    console.log(`Downloading macports installer ${installerUrl}`)
    await Utils.downloadUrlIntoFile(installerPath, installerUrl);

    await $.spawn(`installer -pkg "${installerPath}" -target /;`, { requiresRoot: true })

    await FileUtils.addToStartupFile('')
    await FileUtils.addToStartupFile('export PATH=/opt/local/bin:/opt/local/sbin:$PATH')
  }

  override async destroy(): Promise<void> {
    const $ = getPty();
    await $.spawnSafe('port -fp uninstall installed', { requiresRoot: true, interactive: true });
    await $.spawnSafe('dscl . -delete /Users/macports', { requiresRoot: true });
    await $.spawnSafe('dscl . -delete /Groups/macports', { requiresRoot: true });
    await $.spawnSafe('rm -rf \\\n' +
      '    /opt/local \\\n' +
      '    /Applications/DarwinPorts \\\n' +
      '    /Applications/MacPorts \\\n' +
      '    /Library/LaunchDaemons/org.macports.* \\\n' +
      '    /Library/Receipts/DarwinPorts*.pkg \\\n' +
      '    /Library/Receipts/MacPorts*.pkg \\\n' +
      '    /Library/StartupItems/DarwinPortsStartup \\\n' +
      '    /Library/Tcl/darwinports1.0 \\\n' +
      '    /Library/Tcl/macports1.0 \\\n' +
      '    ~/.macports', { requiresRoot: true })

    await FileUtils.removeLineFromStartupFile('export PATH=/opt/local/bin:/opt/local/sbin:$PATH');

  }

}
