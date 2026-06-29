import {
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
  PackageManager,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { AndroidSdkPackagesParameter } from './android-sdk-packages-parameter.js';
import { exampleAndroidCliBasic, exampleAndroidCliFullSetup } from './examples.js';

export const schema = z
  .object({
    sdkPath: z
      .string()
      .describe(
        'Path to the Android SDK directory. Written to ~/.androidrc as --sdk=<path>. Defaults to the android CLI default location.'
      )
      .optional(),
    packages: z
      .array(z.string())
      .describe(
        'Android SDK packages to install. Examples: "platforms/android-35", "build-tools/35.0.0", "platform-tools", "cmdline-tools/latest", "system-images/android-35/google_apis_playstore/x86_64".'
      )
      .optional(),
  })
  .describe('Android CLI — installs the android command-line tool and manages the Android SDK environment');

export type AndroidCliConfig = z.infer<typeof schema>;

const ANDROIDRC_PATH = path.join(os.homedir(), '.androidrc');

const defaultConfig: Partial<AndroidCliConfig> = {
  packages: [],
};

export class AndroidCliResource extends Resource<AndroidCliConfig> {
  getSettings(): ResourceSettings<AndroidCliConfig> {
    return {
      id: 'android-cli',
      defaultConfig,
      exampleConfigs: {
        example1: exampleAndroidCliBasic,
        example2: exampleAndroidCliFullSetup,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        sdkPath: { type: 'directory', canModify: true },
        packages: { type: 'stateful', definition: new AndroidSdkPackagesParameter() },
      },
    };
  }

  async refresh(params: Partial<AndroidCliConfig>): Promise<Partial<AndroidCliConfig> | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which android');
    if (status === SpawnStatus.ERROR) return null;

    const result: Partial<AndroidCliConfig> = {};

    if (params.sdkPath) {
      try {
        const rcContent = await fs.readFile(ANDROIDRC_PATH, 'utf8');
        const sdkLine = rcContent.split('\n').find((l) => l.startsWith('--sdk='));
        if (!sdkLine) return null;
        result.sdkPath = sdkLine.replace('--sdk=', '').trim();
      } catch {
        return null;
      }
    }

    return result;
  }

  async create(plan: CreatePlan<AndroidCliConfig>): Promise<void> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      await $.spawnSafe('brew tap android/tap', {
        env: { HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_ASK: '1', NONINTERACTIVE: '1' },
      });
      await Utils.installViaPkgMgr('android-cli', undefined, PackageManager.BREW);
    } else {
      if (await Utils.isArmArch()) {
        throw new Error(
          'Android CLI does not support Linux ARM64. Only AMD64/x86_64 is supported on Linux.'
        );
      }
      await $.spawn(
        'curl -fsSL https://dl.google.com/android/cli/latest/linux_x86_64/install.sh | bash',
        { interactive: true }
      );
    }

    if (plan.desiredConfig.sdkPath) {
      await this.setSdkPath(plan.desiredConfig.sdkPath);
    }
  }

  async modify(pc: ParameterChange<AndroidCliConfig>, _plan: ModifyPlan<AndroidCliConfig>): Promise<void> {
    if (pc.name === 'sdkPath') {
      if (pc.newValue) {
        await this.setSdkPath(pc.newValue as string);
      } else {
        await this.removeSdkPath();
      }
    }
  }

  async destroy(plan: DestroyPlan<AndroidCliConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await Utils.uninstallViaPkgMgr('android-cli', undefined, PackageManager.BREW);
    } else {
      const androidBinPath = path.join(os.homedir(), '.local', 'bin', 'android');
      await fs.rm(androidBinPath, { force: true });
    }

    if (plan.currentConfig.sdkPath) {
      await this.removeSdkPath();
    }
  }

  private async setSdkPath(sdkPath: string): Promise<void> {
    let rcContent = '';
    try {
      rcContent = await fs.readFile(ANDROIDRC_PATH, 'utf8');
    } catch { /* file doesn't exist yet */ }

    const lines = rcContent.split('\n').filter(Boolean);
    const sdkIndex = lines.findIndex((l) => l.startsWith('--sdk='));

    if (sdkIndex >= 0) {
      lines[sdkIndex] = `--sdk=${sdkPath}`;
    } else {
      lines.push(`--sdk=${sdkPath}`);
    }

    await fs.writeFile(ANDROIDRC_PATH, lines.join('\n') + '\n', 'utf8');
  }

  private async removeSdkPath(): Promise<void> {
    try {
      const rcContent = await fs.readFile(ANDROIDRC_PATH, 'utf8');
      const remaining = rcContent.split('\n').filter((l) => !l.startsWith('--sdk='));

      if (remaining.filter(Boolean).length === 0) {
        await fs.rm(ANDROIDRC_PATH, { force: true });
      } else {
        await fs.writeFile(ANDROIDRC_PATH, remaining.join('\n') + '\n', 'utf8');
      }
    } catch { /* file doesn't exist, nothing to do */ }
  }
}
