import { Resource, ResourceSettings, SpawnStatus, getPty } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';
import { coerce, compare } from 'semver';

interface XCodeToolsConfig extends StringIndexedObject {}

export class XcodeToolsResource extends Resource<XCodeToolsConfig> {

  getSettings(): ResourceSettings<XCodeToolsConfig> {
    return {
      id: 'xcode-tools',
      operatingSystems: [OS.Darwin],
      importAndDestroy: {
        preventImport: true,
      }
    }
  }

  override async refresh(): Promise<Partial<XCodeToolsConfig> | null> {
    const $ = getPty()

    const { data, status } = await $.spawnSafe('xcode-select -p')

    // The last check, ensures that a valid path is returned.
    if (status === SpawnStatus.ERROR || !data || path.basename(data) === data) {
      return null;
    }

    return {};
  }

  override async create(): Promise<void> {
    const $ = getPty();
    await $.spawn('touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress;');

    try {
      /* Example response:
       * Finding available software
       * Software Update found the following new or updated software:
       * * Label: Command Line Tools for Xcode-15.3
       *         Title: Command Line Tools for Xcode, Version: 15.3, Size: 707501KiB, Recommended: YES,
       */
      const { data } = await $.spawn('softwareupdate -l', { interactive: true });

      // This regex will only match the label because it doesn't match commas.
      const labelRegex = /(Command Line Tools[^,]*\d+\.\d+?)(?=\s+)/g
      const xcodeToolsVersion = data.match(labelRegex);

      if (!xcodeToolsVersion || xcodeToolsVersion.length === 0 || !xcodeToolsVersion[0]) {
        return await this.attemptGUIInstall();
      }

      let latestVersion = '';
      latestVersion = xcodeToolsVersion.length > 0 ? xcodeToolsVersion.reduce((prev, current) => {
          if (!prev) {
            return current;
          }
          
          const currentVerIndex = current.lastIndexOf('-')
          const prevVerIndex = prev.lastIndexOf('-')
          
          const currentVer = current.slice(currentVerIndex + 1);
          const prevVer = prev.slice(prevVerIndex + 1);
          
          return compare(coerce(currentVer)!, coerce(prevVer)!) > 0 ? current : prev;
        }) : xcodeToolsVersion.at(0)!;

      await $.spawn(`softwareupdate -i "${latestVersion}" --verbose`, { requiresRoot: true, interactive: true });

    } finally {
      await fs.rm('/tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress', { force: true, recursive: true });
    }
  }

  override async destroy(): Promise<void> {
    const $ = getPty();
    const { data: installFolder, status } = await $.spawnSafe('xcode-select -p');
    if (status === SpawnStatus.ERROR || !installFolder) {
      return;
    }

    // The user may have xcode tools installed through the full xcode. If this is the case then,
    // xcode tools cannot be individually be uninstalled
    if (installFolder.trim() !== '/Library/Developer/CommandLineTools') {
      console.warn('Full xcode tools install detected. Cannot uninstall just xcode tools. Skipping...');
      return;
    }

    await $.spawn('rm -rf /Library/Developer/CommandLineTools', { requiresRoot: true });
  }

  private async attemptGUIInstall(): Promise<void> {
    console.warn('Unable to find installable xcode tools version. Defaulting to xcode-select --install');
    const $ = getPty();
    await $.spawn('xcode-select --install', { interactive: true, stdin: true });
  }
}
