import { CreatePlan, Resource, ResourceSettings, getPty, z } from '@codifycli/plugin-core';
import { OS } from 'codify-schemas';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import plist from 'plist';

import { Utils } from '../../utils/index.js';
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
      'The directory to install Android Studios into. Defaults to /Applications'
    )
    .optional(),
})
export type AndroidStudioConfig = z.infer<typeof schema>;

export class AndroidStudioResource extends Resource<AndroidStudioConfig> {

  allAndroidStudioVersions?: AndroidStudioVersionData[];

  override getSettings(): ResourceSettings<AndroidStudioConfig> {
    return {
      id: 'android-studio',
      operatingSystems: [OS.Darwin],
      schema,
      parameterSettings: {
        directory: { type: 'directory', default: '/Applications' },
        version: { type: 'version' }
      }
    };
  }

  override async refresh(parameters: Partial<AndroidStudioConfig>): Promise<Partial<AndroidStudioConfig> | null> {
    // Attempt to fetch all versions. The plist doesn't give detailed info on the version
    this.allAndroidStudioVersions = await this.fetchAllAndroidStudioVersions()

    const installedVersions = (await Utils.findApplication('Android Studio')
      .then((locations) => Promise.all(
        locations.map((l) => this.addPlistData(l))
      )))
      .filter(Boolean)
      .map((l) => l!)
      .map((installed) => this.addWebInfo(installed, this.allAndroidStudioVersions!))

    const match = this.matchVersionAndDirectory(parameters, installedVersions);
    if (match) {
      return match;
    }

    return null;
  }

  override async create(plan: CreatePlan<AndroidStudioConfig>): Promise<void> {
    const $ = getPty();

    if (!this.allAndroidStudioVersions) {
      this.allAndroidStudioVersions = await this.fetchAllAndroidStudioVersions()
    }

    const versionToDownload = this.getVersionData(plan.desiredConfig.version, this.allAndroidStudioVersions)
    if (!versionToDownload) {
      throw new Error(`Unable to find desired version: ${plan.desiredConfig.version}`);
    }

    const downloadLink = await Utils.isArmArch()
      ? versionToDownload.download.find((v) => v.link.includes('mac_arm.dmg'))!
      : versionToDownload.download.find((v) => v.link.includes('mac.dmg'))!

    // Create a temporary tmp dir
    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-android-'))

    try {

      // Download and unzip the terraform binary
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

        // Depending on it's preview or regular the name is different
        const appName = contents
          .find((l) => l.includes('Android'))

        // Must rsync because mounted dirs are read-only (can't delete via mv)
        await $.spawn(`rsync -rl "${appName}" Applications/`, { cwd: mountedDir })
      } finally {
        // Unmount
        await $.spawnSafe(`hdiutil detach "${mountedDir}"`)
      }

    } finally {
      // Delete the tmp directory
      await fs.rm(temporaryDir, { recursive: true, force: true });
    }
  }

  override async destroy(): Promise<void> {
    await fs.rm('/Applications/Android Studio.app', { force: true, recursive: true });
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
