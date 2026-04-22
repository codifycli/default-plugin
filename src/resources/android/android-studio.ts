import { CreatePlan, DestroyPlan, Resource, ResourceSettings, Utils, getPty, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import plist from 'plist';

import { Utils as LocalUtils } from '../../utils/index.js';
import { AndroidStudioPlist, AndroidStudioVersionData } from './types.js';

export const schema = z.object({
  version: z
    .string()
    .describe(
      'Android studios version. Visit: https://developer.android.com/studio/releases for version info'
    )
    .optional(),
  directory: z
    .string()
    .describe(
      'The directory to install Android Studios into. Defaults to /Applications on macOS, /opt on Linux'
    )
    .optional(),
}).meta({ $comment: 'https://codifycli.com/docs/resources/android-studio' })

export type AndroidStudioConfig = z.infer<typeof schema>;

const LINUX_INSTALL_DIR = '/opt';
const MACOS_INSTALL_DIR = '/Applications';
const LINUX_STUDIO_DIR = 'android-studio';

export class AndroidStudioResource extends Resource<AndroidStudioConfig> {

  allAndroidStudioVersions?: AndroidStudioVersionData[];

  override getSettings(): ResourceSettings<AndroidStudioConfig> {
    const defaultDir = Utils.isMacOS() ? MACOS_INSTALL_DIR : LINUX_INSTALL_DIR;
    return {
      id: 'android-studio',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        directory: { type: 'directory', default: defaultDir },
        version: { type: 'version' }
      }
    };
  }

  override async refresh(parameters: Partial<AndroidStudioConfig>): Promise<Partial<AndroidStudioConfig> | null> {
    this.allAndroidStudioVersions = await this.fetchAllAndroidStudioVersions()

    if (Utils.isMacOS()) {
      return this.refreshMacOS(parameters);
    }

    return this.refreshLinux(parameters);
  }

  override async create(plan: CreatePlan<AndroidStudioConfig>): Promise<void> {
    if (!this.allAndroidStudioVersions) {
      this.allAndroidStudioVersions = await this.fetchAllAndroidStudioVersions()
    }

    if (Utils.isMacOS()) {
      return this.createMacOS(plan);
    }

    return this.createLinux(plan);
  }

  override async destroy(plan: DestroyPlan<AndroidStudioConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      const directory = plan.currentConfig.directory ?? MACOS_INSTALL_DIR;
      await fs.rm(path.join(directory, 'Android Studio.app'), { force: true, recursive: true });
    } else {
      const $ = getPty();
      const directory = plan.currentConfig.directory ?? LINUX_INSTALL_DIR;
      await $.spawnSafe(`rm -rf "${path.join(directory, LINUX_STUDIO_DIR)}"`, { requiresRoot: true });
    }
  }

  private async refreshMacOS(parameters: Partial<AndroidStudioConfig>): Promise<Partial<AndroidStudioConfig> | null> {
    const installedVersions = (await LocalUtils.findApplication('Android Studio')
      .then((locations) => Promise.all(
        locations.map((l) => this.addPlistData(l))
      )))
      .filter(Boolean)
      .map((l) => l!)
      .map((installed) => this.addWebInfo(installed, this.allAndroidStudioVersions!))

    return this.matchVersionAndDirectory(parameters, installedVersions);
  }

  private async refreshLinux(parameters: Partial<AndroidStudioConfig>): Promise<Partial<AndroidStudioConfig> | null> {
    const directory = parameters.directory ?? LINUX_INSTALL_DIR;
    const studioDir = path.join(directory, LINUX_STUDIO_DIR);
    const studioBin = path.join(studioDir, 'bin', 'studio');

    try {
      await fs.access(studioBin);
    } catch {
      return null;
    }

    // Read product-info.json to determine the installed version
    let installedVersion: string | undefined;
    try {
      const productInfoRaw = await fs.readFile(path.join(studioDir, 'product-info.json'), 'utf8');
      const productInfo = JSON.parse(productInfoRaw) as { dataDirectoryName?: string; version?: string; buildNumber?: string };
      installedVersion = productInfo.version;

      if (!installedVersion && productInfo.buildNumber) {
        const matched = this.allAndroidStudioVersions?.find((v) => v.build === productInfo.buildNumber);
        installedVersion = matched?.version;
      }
    } catch {
      // product-info.json not readable — still report as installed, version unknown
    }

    if (parameters.version && installedVersion && !installedVersion.includes(parameters.version)) {
      return null;
    }

    return {
      directory,
      version: installedVersion,
    };
  }

  private async createMacOS(plan: CreatePlan<AndroidStudioConfig>): Promise<void> {
    const $ = getPty();

    const versionToDownload = this.getVersionData(plan.desiredConfig.version, this.allAndroidStudioVersions!)
    if (!versionToDownload) {
      throw new Error(`Unable to find desired version: ${plan.desiredConfig.version}`);
    }

    const isArm = await Utils.isArmArch();
    const downloadLink = isArm
      ? versionToDownload.download.find((v) => v.link.includes('mac_arm.dmg'))!
      : versionToDownload.download.find((v) => v.link.includes('mac.dmg'))!

    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-android-'))

    try {
      await $.spawn(`curl -fsSL ${downloadLink.link} -o android-studio.dmg`, { cwd: temporaryDir });

      const { data } = await $.spawn('hdiutil attach android-studio.dmg', { cwd: temporaryDir });
      const mountedDir = data.split(/\n/)
        .find((l) => l.includes('/Volumes/'))
        ?.split('                 ')
        ?.at(-1)
        ?.trim()

      if (!mountedDir) {
        throw new Error('Unable to mount dmg or find the mounted volume')
      }

      try {
        const contents = await fs.readdir(mountedDir);
        const appName = contents.find((l) => l.includes('Android'))

        // Must rsync because mounted dirs are read-only (can't delete via mv)
        await $.spawn(`rsync -rl "${appName}" Applications/`, { cwd: mountedDir })
      } finally {
        await $.spawnSafe(`hdiutil detach "${mountedDir}"`)
      }
    } finally {
      await fs.rm(temporaryDir, { recursive: true, force: true });
    }
  }

  private async createLinux(plan: CreatePlan<AndroidStudioConfig>): Promise<void> {
    const $ = getPty();

    const versionToDownload = this.getVersionData(plan.desiredConfig.version, this.allAndroidStudioVersions!)
    if (!versionToDownload) {
      throw new Error(`Unable to find desired version: ${plan.desiredConfig.version}`);
    }

    const downloadLink = versionToDownload.download.find((v) => v.link.includes('-linux.tar.gz'));

    if (!downloadLink) {
      throw new Error(`Unable to find a Linux download link for version: ${plan.desiredConfig.version}`);
    }

    const directory = plan.desiredConfig.directory ?? LINUX_INSTALL_DIR;
    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-android-'))

    try {
      await $.spawn(`curl -fsSL ${downloadLink.link} -o android-studio.tar.gz`, { cwd: temporaryDir });
      await $.spawn(`tar -xzf android-studio.tar.gz`, { cwd: temporaryDir });

      // Remove existing install if present
      await fs.rm(path.join(directory, LINUX_STUDIO_DIR), { force: true, recursive: true });

      await $.spawn(`mv android-studio "${directory}/"`, { cwd: temporaryDir, requiresRoot: true });
    } finally {
      await fs.rm(temporaryDir, { recursive: true, force: true });
    }
  }

  private async fetchAllAndroidStudioVersions(): Promise<AndroidStudioVersionData[]> {
    const res = await fetch('https://jb.gg/android-studio-releases-list.json')

    if (!res.ok) {
      throw new Error('Unable to fetch android-studio-releases-list at https://jb.gg/android-studio-releases-list.json');
    }

    return JSON.parse(await res.text()).content.item
  }

  private async addPlistData(location: string): Promise<{ location: string, plist: AndroidStudioPlist } | null> {
    try {
      const file = await fs.readFile(path.join(location, '/Contents/Info.plist'), 'utf8');
      const plistData = plist.parse(file) as unknown as AndroidStudioPlist;

      return { location, plist: plistData };
    } catch (error) {
      console.log(error)
      return null;
    }
  }

  private addWebInfo(
    installed: { location: string; plist: AndroidStudioPlist },
    allWebInfo: AndroidStudioVersionData[],
  ): { location: string, plist: AndroidStudioPlist, webInfo?: AndroidStudioVersionData } {
    const webInfo = allWebInfo!.find((webVersion) =>
      webVersion.build === installed.plist.CFBundleVersion
    )

    return { ...installed, webInfo }
  }

  private matchVersionAndDirectory(
    parameters: Partial<AndroidStudioConfig>,
    installedVersions: Array<{ location: string; plist: AndroidStudioPlist; webInfo?: AndroidStudioVersionData }>
  ): Partial<AndroidStudioConfig> | null {
    if (installedVersions.length === 0) {
      return null;
    }

    const matched = installedVersions
      .filter(({ plist, webInfo, location }) =>
        parameters.directory === path.dirname(location)
        || !parameters.version
        || webInfo && webInfo.version.includes(parameters.version)
        || parameters.version === plist.CFBundleShortVersionString
      )

    return matched.length > 0
      ? {
        directory: path.dirname(matched[0].location),
        version: matched[0].webInfo?.version ?? matched[0].plist.CFBundleShortVersionString
      }
      : null;
  }

  private getVersionData(
    version: string | undefined,
    allVersionData: AndroidStudioVersionData[],
  ): AndroidStudioVersionData | null {
    if (!version) {
      // Return the latest release build if version is not specified
      return allVersionData.find((d) => d.channel === 'Release')!
    }

    return allVersionData.find((d) => d.version.toString().includes(version)) ?? null
  }
}
