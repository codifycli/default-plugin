import {
  CreatePlan,
  DestroyPlan,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { exampleAndroidEmulatorBasic, exampleAndroidEmulatorPixel } from './examples.js';

export const schema = z
  .object({
    profile: z
      .string()
      .describe(
        'Android hardware profile for the emulator (e.g. "medium_phone", "pixel_9"). Run `android emulator create --list-profiles` to see all available profiles. The profile name is also used as the AVD name.'
      ),
  })
  .describe('Create and manage an Android Virtual Device (AVD) using the android CLI');

export type AndroidEmulatorConfig = z.infer<typeof schema>;

const AVD_DIR = path.join(os.homedir(), '.android', 'avd');

const defaultConfig: Partial<AndroidEmulatorConfig> = {
  profile: '<Replace me here!>',
};

export class AndroidEmulatorResource extends Resource<AndroidEmulatorConfig> {
  getSettings(): ResourceSettings<AndroidEmulatorConfig> {
    return {
      id: 'android-emulator',
      defaultConfig,
      exampleConfigs: {
        example1: exampleAndroidEmulatorBasic,
        example2: exampleAndroidEmulatorPixel,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['android-cli'],
      parameterSettings: {
        profile: {},
      },
      allowMultiple: {
        identifyingParameters: ['profile'],
      },
    };
  }

  async refresh(params: Partial<AndroidEmulatorConfig>): Promise<Partial<AndroidEmulatorConfig> | null> {
    const $ = getPty();

    const { status, data } = await $.spawnSafe('android emulator list', { interactive: true });
    if (status === SpawnStatus.ERROR) return null;

    const avdName = params.profile;
    if (!avdName) return null;

    const lines = data.split('\n').map((l) => l.trim()).filter(Boolean);
    const found = lines.some(
      (l) => l.toLowerCase() === avdName.toLowerCase() || l.toLowerCase().startsWith(avdName.toLowerCase() + ' ')
    );

    if (!found) return null;

    return { profile: params.profile };
  }

  async create(plan: CreatePlan<AndroidEmulatorConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`android emulator create "${plan.desiredConfig.profile}"`, { interactive: true });
  }

  async destroy(plan: DestroyPlan<AndroidEmulatorConfig>): Promise<void> {
    const $ = getPty();
    const avdName = plan.currentConfig.profile;
    if (!avdName) return;

    const { status } = await $.spawnSafe(`avdmanager delete avd -n "${avdName}"`, { interactive: true });

    if (status === SpawnStatus.ERROR) {
      await fs.rm(path.join(AVD_DIR, `${avdName}.avd`), { recursive: true, force: true });
      await fs.rm(path.join(AVD_DIR, `${avdName}.ini`), { force: true });
    }
  }
}
