import { ArrayParameterSetting, ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import semver from 'semver';

import { FileUtils } from '../../../utils/file-utils.js';
import { Utils } from '../../../utils/index.js';
import { JenvConfig } from './jenv.js';
import { nanoid } from 'nanoid';

export const OPENJDK_SUPPORTED_VERSIONS = [8, 11, 17, 21, 22]
export const JAVA_VERSION_INTEGER = /^\d+$/;

export class JenvAddParameter extends ArrayStatefulParameter<JenvConfig, string> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      itemType: 'directory',
      isElementEqual: (a, b) => b.includes(a),
      transformation: {
        to: (input: string[]) =>
          input.map((i) => {
            if (OPENJDK_SUPPORTED_VERSIONS.includes(Number.parseInt(i, 10))) {
              return `/opt/homebrew/Cellar/openjdk@${Number.parseInt(i, 10)}`
            }

            return i;
          }),
        // De-dupe the results for imports.
        from: (output: string[]) => [...new Set(output.map((i) => {
          if (i.startsWith('/opt/homebrew/Cellar/openjdk@')) {
            return i.split('/').at(4)?.split('@').at(1)
          }

          return i;
        }))],
      }
    }
  }

  override async refresh(params: string[]): Promise<null | string[]> {
    const $ = getPty();

    const { data: jenvRoot } = await $.spawn('jenv root')
    const versions = (await fs.readdir(`${jenvRoot}/versions`)).filter((v) => v !== '.DS_store');

    // We use a set because jenv sets an alias for 11.0.24, 11.0 and 11. We only care about the original location here
    const versionPaths = new Set(
      await Promise.all(versions.map((v) =>
        fs.readlink(`${jenvRoot}/versions/${v}`)
      ))
    )

    const installedVersions = (await $.spawn('jenv versions --bare'))
      .data
      .split(/\n/)

    return [...versionPaths]
      // Re-map the path back to what was provided in the config
      .map((v) => {
        const matched = params?.find((p) => v.includes(p));
        return matched === undefined
          ? v
          : matched;
      })
      .filter((v) => {
        const versionStr = v.split('/').at(4)!.split('@').at(1)!;
        return installedVersions.includes(versionStr);
      });
  }

  override async addItem(param: string): Promise<void> {
    let location = param;

    // Check if we should auto install it from homebrew first
    if (param.startsWith('/opt/homebrew/Cellar/openjdk@')) {

      // Doesn't currently exist on the file system, let's parse and install from homebrew before adding
      if (!(await FileUtils.exists(param))) {
        const isHomebrewInstalled = await Utils.isHomebrewInstalled();
        if (!isHomebrewInstalled) {
          throw new Error('Homebrew not detected. Cannot automatically install java version. Jenv does not automatically install' +
            ' java versions, see the jenv docs: https://www.jenv.be. Please manually install a version of java and provide a path to the jenv resource')
        }

        const versionStr = param.split('/').at(4)?.split('@').at(1);
        if (!versionStr) {
          throw new Error(`jenv: malformed version str: ${versionStr}`)
        }

        const parsedVersion = Number.parseInt(versionStr, 10)
        if (!OPENJDK_SUPPORTED_VERSIONS.includes(parsedVersion)) {
          throw new Error(`Unsupported version of java specified. Only [${OPENJDK_SUPPORTED_VERSIONS.join(', ')}] is supported`)
        }

        const $ = getPty();
        const openjdkName = (parsedVersion === 22) ? 'openjdk' : `openjdk@${parsedVersion}`;
        const { status } = await $.spawnSafe(`brew list --formula -1 ${openjdkName}`, { interactive: true });

        // That version is not currently installed with homebrew. Let's install it
        if (status === SpawnStatus.ERROR) {
          console.log(`Homebrew detected. Attempting to install java version ${openjdkName} automatically using homebrew`)
          await $.spawn(`brew install ${openjdkName}`, { interactive: true })
        }

        location = (await this.getHomebrewInstallLocation(openjdkName))!;
        if (!location) {
          throw new Error('Unable to determine location of jdk installed by homebrew. Please report this to the Codify team');
        }

      // Already exists on the file system let's re-map to the actual path
      } else if (!param.endsWith('libexec/openjdk.jdk/Contents/Home')) {
        const versions = (await fs.readdir(param)).filter((v) => v !== '.DS_Store')
        const sortedVersions = semver.sort(versions);

        const latestVersion = sortedVersions.at(-1);
        location = `${param}/${latestVersion}/libexec/openjdk.jdk/Contents/Home`
      }
    }

    const $ = getPty();
    try {
      await $.spawn(`jenv add ${location}`, { interactive: true });
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('jenv: cannot rehash')) {
        await this.rehash();
        return;
      }

      throw error;
    }
  }

  override async removeItem(param: string): Promise<void> {
    const $ = getPty();
    const isHomebrewInstalled = await Utils.isHomebrewInstalled();

    if (isHomebrewInstalled && param.startsWith('/opt/homebrew/Cellar/openjdk@')) {
      const versionStr = param.split('/').at(4)?.split('@').at(1);
      if (!versionStr) {
        throw new Error(`jenv: malformed version str: ${versionStr}`)
      }

      const parsedVersion = Number.parseInt(versionStr, 10)
      const openjdkName = (parsedVersion === 22) ? 'openjdk' : `openjdk@${parsedVersion}`;

      const location = await this.getHomebrewInstallLocation(openjdkName);
      if (location) {
        await $.spawn(`jenv remove ${location}`, { interactive: true })
        await $.spawn(`brew uninstall ${openjdkName}`, { interactive: true })
      }

      return
    }

    await $.spawn(`jenv remove ${param}`, { interactive: true });
  }

  private async getHomebrewInstallLocation(openjdkName: string): Promise<null | string> {
    const $ = getPty();
    const { data: installInfo } = await $.spawn(`brew list --formula -1 ${openjdkName}`, { interactive: true })

    // Example: /opt/homebrew/Cellar/openjdk@17/17.0.11/libexec/
    const libexec = installInfo
      .split(/\n/)
      .find((l) => l.includes('libexec'))
      ?.split('openjdk.jdk/')
      ?.at(0)

    if (!libexec) {
      return null;
    }

    return libexec + 'openjdk.jdk/Contents/Home';
  }

  private async rehash(): Promise<void> {
    const $ = getPty();
    const { data: output } = await $.spawnSafe('jenv rehash', { interactive: true })

    if (output.includes('jenv: cannot rehash')) {
      const existingShims = output.match(/jenv: cannot rehash: (.*) exists/)?.at(1);
      if (!existingShims) {
        return;
      }

      await fs.rename(existingShims, `${existingShims}-${nanoid(4)}`);
      await $.spawn('jenv rehash', { interactive: true })
    }
  }
}
