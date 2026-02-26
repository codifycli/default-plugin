import {
  CreatePlan,
  DestroyPlan,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z
} from '@codifycli/plugin-core';
import { OS } from 'codify-schemas';

import { AsdfPluginVersionsParameter } from './version-parameter.js';

const schema = z
  .object({
    plugin: z.string().describe('Asdf plugin name'),
    versions: z
      .array(z.string())
      .describe('A list of versions to install')
      .optional(),
    gitUrl: z
      .string()
      .describe('The gitUrl of the plugin')
      .optional()
  })
export type AsdfPluginConfig = z.infer<typeof schema>;

const PLUGIN_LIST_REGEX = /^([^ ]+?)\s+([^ ]+)/

export class AsdfPluginResource extends Resource<AsdfPluginConfig> {
  getSettings(): ResourceSettings<AsdfPluginConfig> {
    return {
      id: 'asdf-plugin',
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: ['asdf'],
      schema,
      parameterSettings: {
        versions: { type: 'stateful', definition: new AsdfPluginVersionsParameter() }
      },
    }
  }

  async refresh(parameters: Partial<AsdfPluginConfig>): Promise<Partial<AsdfPluginConfig> | Partial<AsdfPluginConfig>[] | null> {
    const $ = getPty();
    if ((await $.spawnSafe('which asdf')).status === SpawnStatus.ERROR) {
      return null;
    }

    const installedVersions = (await $.spawn('asdf plugin list --urls'))
      .data
      .split(/\n/)
      .filter(Boolean)
      .map((l) => {
        console.log('line', l);
        const matches = l.match(PLUGIN_LIST_REGEX)
        console.log('matches', matches);

        if (!matches) {
          return null;
        }

        const [original, name, gitUrl] = matches;
        return [name, gitUrl] as const;
      }).filter(Boolean)
      .map((l) => l!);


    const installedPlugin = installedVersions.find(([name]) => name === parameters.plugin);
    if (!installedPlugin) {
      return null;
    }

    return {
      plugin: parameters.plugin,
      gitUrl: installedPlugin[1],
    };
  }

  async create(plan: CreatePlan<AsdfPluginConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`asdf plugin add ${plan.desiredConfig.plugin} ${plan.desiredConfig.gitUrl ?? ''}`, { interactive: true });
  }

  async destroy(plan: DestroyPlan<AsdfPluginConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`asdf plugin remove ${plan.currentConfig.plugin} ${plan.currentConfig.gitUrl ?? ''}`, { interactive: true });
  }
}

