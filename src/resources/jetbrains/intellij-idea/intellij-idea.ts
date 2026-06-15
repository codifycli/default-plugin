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
  macAppName: 'IntelliJ IDEA',
  macBinaryName: 'idea',
  configDirPrefix: 'IntelliJIdea',
  caskName: 'intellij-idea',
  snapName: 'intellij-idea-community',
  linuxCommand: 'intellij-idea-community',
};

const schema = z
  .object({
    settingsZip: z
      .string()
      .optional()
      .describe('Absolute path to an IntelliJ IDEA settings ZIP file to import on first install.'),
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
      .describe('Maximum JVM heap size for IntelliJ IDEA, e.g. "2048m" for 2 GB. Defaults to the IDE default (~2 GB).'),
    jvmMinHeapSize: z
      .string()
      .optional()
      .describe('Initial JVM heap size for IntelliJ IDEA, e.g. "512m". Defaults to the IDE default.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/intellij-idea' })
  .describe('Install and configure JetBrains IntelliJ IDEA IDE with plugins and JVM settings.');

export type IntellijIdeaConfig = z.infer<typeof schema>;

const defaultConfig: Partial<IntellijIdeaConfig> = {
  plugins: [],
};

const exampleBasic: ExampleConfig = {
  title: 'IntelliJ IDEA with GitHub Copilot and Docker plugins',
  description:
    'Install IntelliJ IDEA and add the GitHub Copilot and Docker integration plugins for a modern JVM development workflow.',
  configs: [
    {
      type: 'intellij-idea',
      plugins: ['com.github.copilot', 'Docker'],
    },
  ],
};

const exampleAdvanced: ExampleConfig = {
  title: 'IntelliJ IDEA with tuned JVM and imported settings',
  description:
    'Install IntelliJ IDEA, import previous settings from a ZIP, and increase the heap to 4 GB for large projects.',
  configs: [
    {
      type: 'intellij-idea',
      settingsZip: '/path/to/intellij-idea-settings.zip',
      importSettings: true,
      jvmMaxHeapSize: '4096m',
      jvmMinHeapSize: '1024m',
      plugins: ['com.github.copilot', 'Docker'],
    },
  ],
};

export class IntellijIdeaResource extends Resource<IntellijIdeaConfig> {
  getSettings(): ResourceSettings<IntellijIdeaConfig> {
    return {
      id: 'intellij-idea',
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
        plugins: { type: 'stateful', definition: new JetBrainsPluginsParameter<IntellijIdeaConfig>(PRODUCT), order: 1 },
        jvmMaxHeapSize: { type: 'string', canModify: true },
        jvmMinHeapSize: { type: 'string', canModify: true },
      },
    };
  }

  override async refresh(parameters: Partial<IntellijIdeaConfig>): Promise<Partial<IntellijIdeaConfig> | null> {
    const installed = await isInstalled(PRODUCT);
    if (!installed) return null;

    const result: Partial<IntellijIdeaConfig> = {};

    const configDir = await findConfigDir(PRODUCT);
    if (configDir) {
      const vmOptions = await readVmOptions(PRODUCT, configDir);
      if (parameters.jvmMaxHeapSize != null) result.jvmMaxHeapSize = vmOptions.maxHeap;
      if (parameters.jvmMinHeapSize != null) result.jvmMinHeapSize = vmOptions.minHeap;
    }

    return result;
  }

  override async create(plan: CreatePlan<IntellijIdeaConfig>): Promise<void> {
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

  override async modify(pc: ParameterChange<IntellijIdeaConfig>, plan: ModifyPlan<IntellijIdeaConfig>): Promise<void> {
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

  override async destroy(plan: DestroyPlan<IntellijIdeaConfig>): Promise<void> {
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
      throw new Error('Cannot determine IntelliJ IDEA config directory for settings import.');
    }

    await fs.mkdir(configDir, { recursive: true });
    await $.spawn(`unzip -o "${settingsZip}" -d "${configDir}"`, { interactive: true });
  }
}
