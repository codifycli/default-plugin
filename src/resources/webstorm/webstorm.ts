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
import path from 'node:path';

import { MACOS_APP_PATH, MACOS_BINARY, PluginsParameter, findConfigDir, getOrCreateConfigDir } from './plugins-parameter.js';

const schema = z
  .object({
    settingsZip: z
      .string()
      .optional()
      .describe('Absolute path to a WebStorm settings ZIP file to import on first install.'),
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
        '(e.g. "dev.blachut.svelte.lang", "org.jetbrains.plugins.github"). ' +
        'Plugin IDs can be found on the plugin page under Additional Information.'
      ),
    jvmMaxHeapSize: z
      .string()
      .optional()
      .describe('Maximum JVM heap size for WebStorm, e.g. "2048m" for 2 GB. Defaults to the IDE default (~2 GB).'),
    jvmMinHeapSize: z
      .string()
      .optional()
      .describe('Initial JVM heap size for WebStorm, e.g. "512m". Defaults to the IDE default.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/webstorm' })
  .describe('Install and configure JetBrains WebStorm IDE with plugins and JVM settings.');

export type WebStormConfig = z.infer<typeof schema>;

const defaultConfig: Partial<WebStormConfig> = {
  plugins: [],
};

const exampleBasic: ExampleConfig = {
  title: 'WebStorm with Svelte and GitHub plugins',
  description:
    'Install WebStorm and add the Svelte and GitHub integration plugins for a modern front-end workflow.',
  configs: [
    {
      type: 'webstorm',
      plugins: ['dev.blachut.svelte.lang', 'org.jetbrains.plugins.github'],
    },
  ],
};

const exampleAdvanced: ExampleConfig = {
  title: 'WebStorm with tuned JVM and imported settings',
  description:
    'Install WebStorm, import previous settings from a ZIP, and increase the heap to 4 GB for large projects.',
  configs: [
    {
      type: 'webstorm',
      settingsZip: '/path/to/webstorm-settings.zip',
      importSettings: true,
      jvmMaxHeapSize: '4096m',
      jvmMinHeapSize: '1024m',
      plugins: ['dev.blachut.svelte.lang', 'org.jetbrains.plugins.github'],
    },
  ],
};

export class WebStormResource extends Resource<WebStormConfig> {
  getSettings(): ResourceSettings<WebStormConfig> {
    return {
      id: 'webstorm',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleAdvanced,
      },
      parameterSettings: {
        settingsZip: { type: 'string', setting: true },
        importSettings: { type: 'boolean', default: true, setting: true },
        plugins: { type: 'stateful', definition: new PluginsParameter(), order: 1 },
        jvmMaxHeapSize: { type: 'string' },
        jvmMinHeapSize: { type: 'string' },
      },
    };
  }

  override async refresh(parameters: Partial<WebStormConfig>): Promise<Partial<WebStormConfig> | null> {
    const installed = await this.isInstalled();
    if (!installed) return null;

    const result: Partial<WebStormConfig> = {};

    const configDir = await findConfigDir();
    if (configDir) {
      const vmOptions = await readVmOptions(configDir);
      if (parameters.jvmMaxHeapSize != null) result.jvmMaxHeapSize = vmOptions.maxHeap;
      if (parameters.jvmMinHeapSize != null) result.jvmMinHeapSize = vmOptions.minHeap;
    }

    return result;
  }

  override async create(plan: CreatePlan<WebStormConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await this.installMacOS();
    } else {
      await this.installLinux();
    }

    const { settingsZip, importSettings = true, jvmMaxHeapSize, jvmMinHeapSize } = plan.desiredConfig;

    if (settingsZip && importSettings) {
      await this.importSettingsZip(settingsZip);
    }

    if (jvmMaxHeapSize != null || jvmMinHeapSize != null) {
      const configDir = await getOrCreateConfigDir();
      if (configDir) {
        await writeVmOptions(configDir, jvmMaxHeapSize, jvmMinHeapSize);
      }
    }
  }

  override async modify(pc: ParameterChange<WebStormConfig>, plan: ModifyPlan<WebStormConfig>): Promise<void> {
    if (pc.name !== 'jvmMaxHeapSize' && pc.name !== 'jvmMinHeapSize') return;

    const configDir = await getOrCreateConfigDir();
    if (!configDir) return;

    const { jvmMaxHeapSize, jvmMinHeapSize } = plan.desiredConfig;

    if (jvmMaxHeapSize == null && jvmMinHeapSize == null) {
      await removeVmOptions(configDir);
    } else {
      await writeVmOptions(configDir, jvmMaxHeapSize, jvmMinHeapSize);
    }
  }

  override async destroy(plan: DestroyPlan<WebStormConfig>): Promise<void> {
    const { jvmMaxHeapSize, jvmMinHeapSize } = plan.currentConfig;

    if (jvmMaxHeapSize != null || jvmMinHeapSize != null) {
      const configDir = await findConfigDir();
      if (configDir) await removeVmOptions(configDir);
    }

    if (Utils.isMacOS()) {
      await this.uninstallMacOS();
    } else {
      await this.uninstallLinux();
    }
  }

  // ── macOS ────────────────────────────────────────────────────────────────────

  private async installMacOS(): Promise<void> {
    const $ = getPty();
    await $.spawn('brew install --cask webstorm', {
      interactive: true,
      env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
    });
    // Create a CLI launcher symlink so `webstorm` works from the terminal
    await $.spawnSafe(
      `ln -sf "${MACOS_BINARY}" /usr/local/bin/webstorm`,
      { requiresRoot: true }
    );
  }

  private async uninstallMacOS(): Promise<void> {
    const $ = getPty();
    await $.spawnSafe('brew uninstall --cask webstorm', {
      env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
    });
    await $.spawnSafe('rm -f /usr/local/bin/webstorm', { requiresRoot: true });
  }

  // ── Linux ────────────────────────────────────────────────────────────────────

  private async installLinux(): Promise<void> {
    const $ = getPty();
    const snapCheck = await $.spawnSafe('which snap');
    if (snapCheck.status !== SpawnStatus.SUCCESS) {
      await Utils.installViaPkgMgr('snapd');
    }
    await $.spawn('snap install webstorm --classic', {
      interactive: true,
      requiresRoot: true,
    });
  }

  private async uninstallLinux(): Promise<void> {
    const $ = getPty();
    await $.spawnSafe('snap remove webstorm', { requiresRoot: true });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async isInstalled(): Promise<boolean> {
    if (Utils.isMacOS()) {
      try {
        await fs.access(path.join(MACOS_APP_PATH, 'Contents', 'MacOS', 'webstorm'));
        return true;
      } catch {
        return false;
      }
    }

    const $ = getPty();
    const result = await $.spawnSafe('which webstorm');
    return result.status === SpawnStatus.SUCCESS;
  }

  private async importSettingsZip(settingsZip: string): Promise<void> {
    const $ = getPty();

    const unzipCheck = await $.spawnSafe('which unzip');
    if (unzipCheck.status !== SpawnStatus.SUCCESS) {
      await Utils.installViaPkgMgr('unzip');
    }

    const configDir = await getOrCreateConfigDir();
    if (!configDir) {
      throw new Error('Cannot determine WebStorm config directory for settings import.');
    }

    await fs.mkdir(configDir, { recursive: true });
    await $.spawn(`unzip -o "${settingsZip}" -d "${configDir}"`, { interactive: true });
  }
}

// ── vmoptions file helpers ────────────────────────────────────────────────────

async function readVmOptions(configDir: string): Promise<{ maxHeap?: string; minHeap?: string }> {
  try {
    const content = await fs.readFile(path.join(configDir, 'webstorm.vmoptions'), 'utf8');
    const lines = content.split('\n');
    const maxHeap = lines.find((l) => l.startsWith('-Xmx'))?.slice('-Xmx'.length).trim();
    const minHeap = lines.find((l) => l.startsWith('-Xms'))?.slice('-Xms'.length).trim();
    return { maxHeap, minHeap };
  } catch {
    return {};
  }
}

async function writeVmOptions(configDir: string, maxHeap?: string, minHeap?: string): Promise<void> {
  const optionsPath = path.join(configDir, 'webstorm.vmoptions');
  let lines: string[] = [];

  try {
    lines = (await fs.readFile(optionsPath, 'utf8')).split('\n');
  } catch { /* file doesn't exist yet */ }

  lines = lines.filter((l) => !l.startsWith('-Xmx') && !l.startsWith('-Xms'));
  if (maxHeap) lines.push(`-Xmx${maxHeap}`);
  if (minHeap) lines.push(`-Xms${minHeap}`);

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(optionsPath, lines.join('\n').trim() + '\n');
}

async function removeVmOptions(configDir: string): Promise<void> {
  const optionsPath = path.join(configDir, 'webstorm.vmoptions');
  try {
    const lines = (await fs.readFile(optionsPath, 'utf8'))
      .split('\n')
      .filter((l) => !l.startsWith('-Xmx') && !l.startsWith('-Xms'));
    const content = lines.join('\n').trim();
    if (content) {
      await fs.writeFile(optionsPath, content + '\n');
    } else {
      await fs.rm(optionsPath, { force: true });
    }
  } catch { /* nothing to remove */ }
}
