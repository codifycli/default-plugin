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
  JetBrainsPluginsParameter,
  JetBrainsProductInfo,
  findConfigDir,
  getOrCreateConfigDir,
  installLinux,
  installMacOS,
  isInstalled,
  readVmOptions,
  removeVmOptions,
  uninstallLinux,
  uninstallMacOS,
  writeVmOptions,
} from '../common/jetbrains-common.js';

const PRODUCT: JetBrainsProductInfo = {
  macAppName: 'GoLand',
  macBinaryName: 'goland',
  configDirPrefix: 'GoLand',
  caskName: 'goland',
  snapName: 'goland',
  linuxCommand: 'goland',
};

const schema = z
  .object({
    settingsZip: z
      .string()
      .optional()
      .describe('Absolute path to a GoLand settings ZIP file to import on first install.'),
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
      .describe('Maximum JVM heap size for GoLand, e.g. "2048m" for 2 GB. Defaults to the IDE default (~2 GB).'),
    jvmMinHeapSize: z
      .string()
      .optional()
      .describe('Initial JVM heap size for GoLand, e.g. "512m". Defaults to the IDE default.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/goland' })
  .describe('Install and configure JetBrains GoLand IDE with plugins and JVM settings.');

export type GoLandConfig = z.infer<typeof schema>;

const defaultConfig: Partial<GoLandConfig> = {
  plugins: [],
};

const exampleBasic: ExampleConfig = {
  title: 'GoLand with GitHub Copilot and Docker plugins',
  description:
    'Install GoLand and add the GitHub Copilot and Docker integration plugins for a modern Go development workflow.',
  configs: [
    {
      type: 'goland',
      plugins: ['com.github.copilot', 'Docker'],
    },
  ],
};

const exampleAdvanced: ExampleConfig = {
  title: 'GoLand with tuned JVM and imported settings',
  description:
    'Install GoLand, import previous settings from a ZIP, and increase the heap to 4 GB for large projects.',
  configs: [
    {
      type: 'goland',
      settingsZip: '/path/to/goland-settings.zip',
      importSettings: true,
      jvmMaxHeapSize: '4096m',
      jvmMinHeapSize: '1024m',
      plugins: ['com.github.copilot', 'Docker'],
    },
  ],
};

export class GoLandResource extends Resource<GoLandConfig> {
  getSettings(): ResourceSettings<GoLandConfig> {
    return {
      id: 'goland',
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
        plugins: { type: 'stateful', definition: new JetBrainsPluginsParameter<GoLandConfig>(PRODUCT), order: 1 },
        jvmMaxHeapSize: { type: 'string', canModify: true },
        jvmMinHeapSize: { type: 'string', canModify: true },
      },
    };
  }

  override async refresh(parameters: Partial<GoLandConfig>): Promise<Partial<GoLandConfig> | null> {
    const installed = await isInstalled(PRODUCT);
    if (!installed) return null;

    const result: Partial<GoLandConfig> = {};

    const configDir = await findConfigDir(PRODUCT);
    if (configDir) {
      const vmOptions = await readVmOptions(PRODUCT, configDir);
      if (parameters.jvmMaxHeapSize != null) result.jvmMaxHeapSize = vmOptions.maxHeap;
      if (parameters.jvmMinHeapSize != null) result.jvmMinHeapSize = vmOptions.minHeap;
    }

    return result;
  }

  override async create(plan: CreatePlan<GoLandConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await installMacOS(PRODUCT);
    } else {
      await installLinux(PRODUCT);
    }

    const { settingsZip, importSettings = true, jvmMaxHeapSize, jvmMinHeapSize } = plan.desiredConfig;

    if (settingsZip && importSettings) {
      await this.importSettingsZip(settingsZip);
    }

    if (jvmMaxHeapSize != null || jvmMinHeapSize != null) {
      const configDir = await getOrCreateConfigDir(PRODUCT);
      if (configDir) {
        await writeVmOptions(PRODUCT, configDir, jvmMaxHeapSize, jvmMinHeapSize);
      }
    }
  }

  override async modify(pc: ParameterChange<GoLandConfig>, plan: ModifyPlan<GoLandConfig>): Promise<void> {
    if (pc.name !== 'jvmMaxHeapSize' && pc.name !== 'jvmMinHeapSize') return;

    const configDir = await getOrCreateConfigDir(PRODUCT);
    if (!configDir) return;

    const { jvmMaxHeapSize, jvmMinHeapSize } = plan.desiredConfig;

    if (jvmMaxHeapSize == null && jvmMinHeapSize == null) {
      await removeVmOptions(PRODUCT, configDir);
    } else {
      await writeVmOptions(PRODUCT, configDir, jvmMaxHeapSize, jvmMinHeapSize);
    }
  }

  override async destroy(plan: DestroyPlan<GoLandConfig>): Promise<void> {
    const { jvmMaxHeapSize, jvmMinHeapSize } = plan.currentConfig;

    if (jvmMaxHeapSize != null || jvmMinHeapSize != null) {
      const configDir = await findConfigDir(PRODUCT);
      if (configDir) await removeVmOptions(PRODUCT, configDir);
    }

    if (Utils.isMacOS()) {
      await uninstallMacOS(PRODUCT);
    } else {
      await uninstallLinux(PRODUCT);
    }
  }

  private async importSettingsZip(settingsZip: string): Promise<void> {
    const $ = getPty();

    const unzipCheck = await $.spawnSafe('which unzip');
    if (unzipCheck.status !== SpawnStatus.SUCCESS) {
      await Utils.installViaPkgMgr('unzip');
    }

    const configDir = await getOrCreateConfigDir(PRODUCT);
    if (!configDir) {
      throw new Error('Cannot determine GoLand config directory for settings import.');
    }

    await fs.mkdir(configDir, { recursive: true });
    await $.spawn(`unzip -o "${settingsZip}" -d "${configDir}"`, { interactive: true });
  }
}
