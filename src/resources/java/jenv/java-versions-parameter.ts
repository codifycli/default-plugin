import { ArrayParameterSetting, ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';
import fs from 'node:fs/promises';
import semver from 'semver';

import { FileUtils } from '../../../utils/file-utils.js';
import { Utils } from '../../../utils/index.js';
import { JenvConfig } from './jenv.js';
import { nanoid } from 'nanoid';

export const JAVA_VERSION_INTEGER = /^\d+$/;

// Maps an integer version to the Homebrew Cellar prefix (macOS)
function toBrewPath(version: number): string {
  return `/opt/homebrew/Cellar/openjdk@${version}`;
}

// Maps an integer version to the system JVM path (Linux)
// Covers both x86_64 (amd64) and aarch64 (arm64) architectures
async function toLinuxJvmPath(version: number): Promise<string> {
  const candidates = [
    `/usr/lib/jvm/java-${version}-openjdk-amd64`,
    `/usr/lib/jvm/java-${version}-openjdk-arm64`,
    `/usr/lib/jvm/java-${version}-openjdk`,
    `/usr/lib/jvm/temurin-${version}`,
    `/usr/lib/jvm/java-${version}`,
  ];

  for (const candidate of candidates) {
    if (await FileUtils.exists(candidate)) {
      return candidate;
    }
  }

  // Return the most common path as the default even if it doesn't exist yet
  const isArm = await Utils.isArmArch();
  return `/usr/lib/jvm/java-${version}-openjdk-${isArm ? 'arm64' : 'amd64'}`;
}

function parseVersionFromBrewPath(p: string): string | undefined {
  return p.split('/').at(4)?.split('@').at(1);
}

export class JenvAddParameter extends ArrayStatefulParameter<JenvConfig, string> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      itemType: 'directory',
      isElementEqual: (a, b) => b.includes(a),
      transformation: {
        to: async (input: string[]) =>
          Promise.all(input.map(async (i) => {
            const parsed = Number.parseInt(i, 10);
            if (JAVA_VERSION_INTEGER.test(i) && !Number.isNaN(parsed)) {
              return Utils.isMacOS()
                ? toBrewPath(parsed)
                : await toLinuxJvmPath(parsed);
            }

            return i;
          })),
        // De-dupe the results for imports.
        from: (output: string[]) => [...new Set(output.map((i) => {
          if (i.startsWith('/opt/homebrew/Cellar/openjdk@')) {
            return parseVersionFromBrewPath(i);
          }

          // Linux: /usr/lib/jvm/java-17-openjdk-amd64 → "17"
          const linuxMatch = i.match(/\/usr\/lib\/jvm\/(?:java-|temurin-)(\d+)/);
          if (linuxMatch) {
            return linuxMatch[1];
          }

          return i;
        }))],
      }
    }
  }

  override async refresh(params: string[]): Promise<null | string[]> {
    const $ = getPty();

    const { data: jenvRoot } = await $.spawn('jenv root')
    const versions = (await fs.readdir(`${jenvRoot.trim()}/versions`)).filter((v) => v !== '.DS_store' && v !== '.DS_Store');

    // We use a set because jenv sets an alias for 11.0.24, 11.0 and 11. We only care about the original location here
    const versionPaths = new Set(
      await Promise.all(versions.map((v) =>
        fs.readlink(`${jenvRoot.trim()}/versions/${v}`)
      ))
    )

    const installedVersions = (await $.spawn('jenv versions --bare'))
      .data
      .split(/\n/)

    return [...versionPaths]
      // Re-map the path back to what was provided in the config
      .map((v) => {
        const matched = params?.find((p) => v.includes(p));
        return matched === undefined ? v : matched;
      })
      .filter((v) => {
        // macOS Homebrew path: /opt/homebrew/Cellar/openjdk@17/...
        if (v.startsWith('/opt/homebrew/Cellar/openjdk@')) {
          const versionStr = parseVersionFromBrewPath(v);
          return versionStr !== undefined && installedVersions.some((iv) => iv.startsWith(versionStr));
        }

        // Linux JVM path: /usr/lib/jvm/java-17-openjdk-amd64
        const linuxMatch = v.match(/\/usr\/lib\/jvm\/(?:java-|temurin-)(\d+)/);
        if (linuxMatch) {
          const versionStr = linuxMatch[1];
          return installedVersions.some((iv) => iv.startsWith(versionStr));
        }

        // Generic path: match against installed version strings
        return installedVersions.some((iv) => v.includes(iv));
      });
  }

  override async addItem(param: string): Promise<void> {
    let location = param;

    // macOS: auto-install from Homebrew
    if (param.startsWith('/opt/homebrew/Cellar/openjdk@')) {
      if (!(await FileUtils.exists(param))) {
        const isHomebrewInstalled = await Utils.isHomebrewInstalled();
        if (!isHomebrewInstalled) {
          throw new Error('Homebrew not detected. Cannot automatically install java version. Jenv does not automatically install' +
            ' java versions, see the jenv docs: https://www.jenv.be. Please manually install a version of java and provide a path to the jenv resource')
        }

        const versionStr = parseVersionFromBrewPath(param);
        if (!versionStr) {
          throw new Error(`jenv: malformed version str: ${versionStr}`)
        }

        const parsedVersion = Number.parseInt(versionStr, 10)
        const $ = getPty();
        const openjdkName = `openjdk@${parsedVersion}`;
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

      // Already exists on the file system: re-map to the actual versioned path
      } else if (!param.endsWith('libexec/openjdk.jdk/Contents/Home')) {
        const versions = (await fs.readdir(param)).filter((v) => v !== '.DS_Store')
        const sortedVersions = semver.sort(versions);

        const latestVersion = sortedVersions.at(-1);
        location = `${param}/${latestVersion}/libexec/openjdk.jdk/Contents/Home`
      }
    }

    // Linux: auto-install via apt
    if (Utils.isLinux()) {
      const linuxMatch = param.match(/\/usr\/lib\/jvm\/(?:java-|temurin-)(\d+)/);
      if (linuxMatch && !(await FileUtils.exists(param))) {
        const version = linuxMatch[1];
        const $ = getPty();
        const packageName = `openjdk-${version}-jdk`;
        const { status } = await $.spawnSafe(`dpkg -s ${packageName}`, { interactive: true, requiresRoot: true });

        if (status === SpawnStatus.ERROR) {
          console.log(`apt detected. Attempting to install java version ${packageName} automatically`)
          await $.spawn(`apt-get install -y ${packageName}`, { interactive: true, requiresRoot: true })
        }

        location = await toLinuxJvmPath(Number.parseInt(version, 10));
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
      const versionStr = parseVersionFromBrewPath(param);
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

    if (Utils.isLinux()) {
      const linuxMatch = param.match(/\/usr\/lib\/jvm\/(?:java-|temurin-)(\d+)/);
      if (linuxMatch) {
        const version = linuxMatch[1];
        await $.spawn(`jenv remove ${param}`, { interactive: true })
        await $.spawn(`sudo apt-get remove -y openjdk-${version}-jdk`, { interactive: true })
        return;
      }
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
