import {
  CreatePlan,
  DestroyPlan,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from 'codify-schemas';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';

const schema = z.object({
  plugin: z
    .string()
    .describe('Asdf plugin name')
    .optional(),
  versions: z
    .array(z.string())
    .describe('A list of versions to install')
    .optional(),
  directory: z
    .string()
    .describe('The directory to run the install command')
    .optional(),
});

export type AsdfInstallConfig = z.infer<typeof schema>;
const CURRENT_VERSION_REGEX = /^([^ ]+?)\s+([^ ]+?)\s+.*/;
const TOOL_VERSIONS_REGEX = /^([^ ]+) +([^ ]+)$/;


export class AsdfInstallResource extends Resource<AsdfInstallConfig> {
  getSettings(): ResourceSettings<AsdfInstallConfig> {
    return {
      id: 'asdf-install',
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: ['asdf'],
      schema,
      parameterSettings: {
        directory: { type: 'directory' },
        versions: { type: 'array' }
      },
      importAndDestroy:{
        requiredParameters: ['directory'],
        refreshKeys: ['directory']
      },
    }
  }

  async validate(parameters: Partial<AsdfInstallConfig>): Promise<void> {
    if ((parameters.directory && parameters.versions) || (parameters.directory && parameters.plugin)) {
      throw new Error('Asdf directory install cannot be specified together with plugin and parameter');
    }

    if (!parameters.directory && !(parameters.versions && parameters.plugin)) {
      throw new Error('Both versions and plugin must be specified together');
    }

    if (parameters.directory && !(await FileUtils.checkDirExistsOrThrowIfFile(parameters.directory))) {
      throw new Error(`Directory ${parameters.directory} does not exist`);
    }
  }

  async refresh(parameters: Partial<AsdfInstallConfig>): Promise<Partial<AsdfInstallConfig> | Partial<AsdfInstallConfig>[] | null> {
    const $ = getPty();

    if ((await $.spawnSafe('which asdf')).status === SpawnStatus.ERROR) {
      return null;
    }

    if (parameters.directory) {
      const desiredTools = await this.getToolVersions(parameters.directory);

      for (const { plugin, version } of desiredTools) {
        const { status, data } = await $.spawnSafe(`asdf current ${plugin} --no-header`, { cwd: parameters.directory });
        if (status === SpawnStatus.ERROR || data.trim() === '') {
          return null;
        }

        const [_, currentPlugin, currentVersion] = data.match(CURRENT_VERSION_REGEX)!;
        if (currentPlugin !== plugin || currentVersion !== version) {
          return null;
        }
      }

      return {
        directory: parameters.directory,
      };
    }

    // Directly check plugin version
    const versionsQuery = await $.spawnSafe(`asdf list ${parameters.plugin}`);
    if (versionsQuery.status === SpawnStatus.ERROR || versionsQuery.data.trim().includes('No compatible versions installed')) {
      return null;
    }

    const latest = parameters.versions?.includes('latest')
      ? (await $.spawnSafe(`asdf latest ${parameters.plugin}`)).data.trim()
      : null;

    const versions = versionsQuery.data.split(/\n/)
      .map((l) => l.trim())
      .map((l) => l.replaceAll('*', ''))
      .map((l) => l.trim() === latest ? 'latest' : l)
      .filter(Boolean);

    return {
      plugin: parameters.plugin,
      versions,
    }
  }

  async create(plan: CreatePlan<AsdfInstallConfig>): Promise<void> {
    const $ = getPty();

    if (plan.desiredConfig.directory) {
      const desiredTools = await this.getToolVersions(plan.desiredConfig.directory);

      // Make sure all of the plugins are installed. If not installed, then install them
      for (const { plugin } of desiredTools) {
        if ((await $.spawnSafe(`asdf list ${plugin}`)).status === SpawnStatus.ERROR) {
          await $.spawn(`asdf plugin add ${plugin}`, { interactive: true });
        }
      }

      await $.spawn('asdf install', { cwd: plan.desiredConfig.directory, interactive: true });
      return;
    }

    await $.spawn(`asdf install ${plan.desiredConfig?.plugin} ${plan.desiredConfig.versions?.join(' ')}`, { interactive: true });
  }

  async destroy(plan: DestroyPlan<AsdfInstallConfig>): Promise<void> {
    const $ = getPty();
    if (plan.currentConfig.directory) {
      const desiredTools = await this.getToolVersions(plan.currentConfig.directory);

      // Uninstall plugin versions listed in .tool-versions
      for (const { plugin, version } of desiredTools) {
        await $.spawn(`asdf uninstall ${plugin} ${version === 'latest'? `$(asdf latest ${plugin})` : version}`, { interactive: true });
      }

      return;
    }

    // Other path is uninstalled through the stateful parameter
    await $.spawn(`asdf uninstall ${plan.currentConfig?.plugin} ${plan.currentConfig.versions
      ?.map(version => version === 'latest'? `$(asdf latest ${plan.currentConfig?.plugin})` : version)
      .join(' ')}`, { interactive: true });
  }

  private async getToolVersions(directory: string): Promise<Array<{ plugin: string; version: string }>> {
    const toolsVersions = (await fs.readFile(path.join(directory, '.tool-versions'))).toString();

    return toolsVersions.split(/\n/g)
      .filter(Boolean)
      .map((l) => {
        const matches = l.match(TOOL_VERSIONS_REGEX);
        if (!matches || matches.length < 3) {
          throw new Error(`Asdf resource: unable to parse improperly formatted ${directory}/.tool-versions file.\n ${toolsVersions}`)
        }

        return matches.slice(1, 3)
      })
      .map(([plugin, version]) => ({ plugin, version }));
  }
}
