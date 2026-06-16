import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';

import {
  JetBrainsCommon,
  JetBrainsPluginsParameter,
  JetBrainsProductInfo,
} from '../common/jetbrains-common.js';

const PRODUCT: JetBrainsProductInfo = {
  macAppName: 'PhpStorm',
  macBinaryName: 'phpstorm',
  configDirPrefix: 'PhpStorm',
  caskName: 'phpstorm',
  snapName: 'phpstorm',
  linuxCommand: 'phpstorm',
};

const schema = z
  .object({
    settingsZip: z
      .string()
      .optional()
      .describe('Absolute path to a PhpStorm settings ZIP file to import on first install.'),
    importSettings: z
      .boolean()
      .optional()
      .describe(
        'Whether to import the settings from settingsZip during create. ' +
        'Defaults to true. Set to false to skip the import even when settingsZip is provided.'
      ),
    plugins: z
      .array(z.string())
      .optional()
      .describe(
        'JetBrains Marketplace plugin IDs to install ' +
        '(e.g. "com.github.copilot", "Docker"). ' +
        'Plugin IDs can be found on the plugin page under Additional Information.'
      ),
    jvmMaxHeapSize: z
      .string()
      .optional()
      .describe('Maximum JVM heap size for PhpStorm, e.g. "2048m" for 2 GB. Defaults to the IDE default (~2 GB).'),
    jvmMinHeapSize: z
      .string()
      .optional()
      .describe('Initial JVM heap size for PhpStorm, e.g. "512m". Defaults to the IDE default.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/phpstorm' })
  .describe('Install and configure JetBrains PhpStorm IDE with plugins and JVM settings.');

export type PhpStormConfig = z.infer<typeof schema>;

const defaultConfig: Partial<PhpStormConfig> = {
  plugins: [],
};

const exampleBasic: ExampleConfig = {
  title: 'PhpStorm with GitHub Copilot and Docker plugins',
  description:
    'Install PhpStorm and add the GitHub Copilot and Docker integration plugins for a modern PHP development workflow.',
  configs: [
    {
      type: 'phpstorm',
      plugins: ['com.github.copilot', 'Docker'],
    },
  ],
};

const exampleAdvanced: ExampleConfig = {
  title: 'PhpStorm with tuned JVM and imported settings',
  description:
    'Install PhpStorm, import previous settings from a ZIP, and increase the heap to 4 GB for large projects.',
  configs: [
    {
      type: 'phpstorm',
      settingsZip: '/path/to/phpstorm-settings.zip',
      importSettings: true,
      jvmMaxHeapSize: '4096m',
      jvmMinHeapSize: '1024m',
      plugins: ['com.github.copilot', 'Docker'],
    },
  ],
};

export class PhpStormResource extends Resource<PhpStormConfig> {
  getSettings(): ResourceSettings<PhpStormConfig> {
    return {
      id: 'phpstorm',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleAdvanced,
      },
      parameterSettings: {
        settingsZip: { type: 'string', setting: true },
        importSettings: { type: 'boolean', setting: true },
        plugins: { type: 'stateful', definition: new JetBrainsPluginsParameter<PhpStormConfig>(PRODUCT), order: 1 },
        jvmMaxHeapSize: { type: 'string', canModify: true },
        jvmMinHeapSize: { type: 'string', canModify: true },
      },
    };
  }

  override async refresh(parameters: Partial<PhpStormConfig>): Promise<Partial<PhpStormConfig> | null> {
    const installed = await JetBrainsCommon.isInstalled(PRODUCT);
    if (!installed) return null;

    const result: Partial<PhpStormConfig> = {};

    const configDir = await JetBrainsCommon.findConfigDir(PRODUCT);
    if (configDir) {
      const vmOptions = await JetBrainsCommon.readVmOptions(PRODUCT, configDir);
      if (parameters.jvmMaxHeapSize != null) result.jvmMaxHeapSize = vmOptions.maxHeap;
      if (parameters.jvmMinHeapSize != null) result.jvmMinHeapSize = vmOptions.minHeap;
    }

    return result;
  }

  override async create(plan: CreatePlan<PhpStormConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await JetBrainsCommon.installMacOS(PRODUCT);
    } else {
      await JetBrainsCommon.installLinux(PRODUCT);
    }

    const { settingsZip, importSettings = true, jvmMaxHeapSize, jvmMinHeapSize } = plan.desiredConfig;

    if (settingsZip && importSettings) {
      await this.importSettingsZip(settingsZip);
    }

    if (jvmMaxHeapSize != null || jvmMinHeapSize != null) {
      const configDir = await JetBrainsCommon.getOrCreateConfigDir(PRODUCT);
      if (configDir) {
        await JetBrainsCommon.writeVmOptions(PRODUCT, configDir, jvmMaxHeapSize, jvmMinHeapSize);
      }
    }
  }

  override async modify(pc: ParameterChange<PhpStormConfig>, plan: ModifyPlan<PhpStormConfig>): Promise<void> {
    if (pc.name !== 'jvmMaxHeapSize' && pc.name !== 'jvmMinHeapSize') return;

    const configDir = await JetBrainsCommon.getOrCreateConfigDir(PRODUCT);
    if (!configDir) return;

    const { jvmMaxHeapSize, jvmMinHeapSize } = plan.desiredConfig;

    if (jvmMaxHeapSize == null && jvmMinHeapSize == null) {
      await JetBrainsCommon.removeVmOptions(PRODUCT, configDir);
    } else {
      await JetBrainsCommon.writeVmOptions(PRODUCT, configDir, jvmMaxHeapSize, jvmMinHeapSize);
    }
  }

  override async destroy(plan: DestroyPlan<PhpStormConfig>): Promise<void> {
    const { jvmMaxHeapSize, jvmMinHeapSize } = plan.currentConfig;

    if (jvmMaxHeapSize != null || jvmMinHeapSize != null) {
      const configDir = await JetBrainsCommon.findConfigDir(PRODUCT);
      if (configDir) await JetBrainsCommon.removeVmOptions(PRODUCT, configDir);
    }

    if (Utils.isMacOS()) {
      await JetBrainsCommon.uninstallMacOS(PRODUCT);
    } else {
      await JetBrainsCommon.uninstallLinux(PRODUCT);
    }
  }

  private async importSettingsZip(settingsZip: string): Promise<void> {
    const $ = getPty();

    const unzipCheck = await $.spawnSafe('which unzip');
    if (unzipCheck.status !== SpawnStatus.SUCCESS) {
      await Utils.installViaPkgMgr('unzip');
    }

    const configDir = await JetBrainsCommon.getOrCreateConfigDir(PRODUCT);
    if (!configDir) {
      throw new Error('Cannot determine PhpStorm config directory for settings import.');
    }

    await fs.mkdir(configDir, { recursive: true });
    await $.spawn(`unzip -o "${settingsZip}" -d "${configDir}"`, { interactive: true });
  }
}
