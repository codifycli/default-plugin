import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

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
  }).meta({ $comment: 'https://codifycli.com/docs/resources/asdf/asdf-plugin' })
    .describe('Asdf plugin resource for installing asdf plugins.');
export type AsdfPluginConfig = z.infer<typeof schema>;

const defaultConfig: Partial<AsdfPluginConfig> = {
  plugin: '<Replace me here!>',
}

const exampleNodejs: ExampleConfig = {
  title: 'Node.js plugin via asdf',
  description: 'Install the asdf Node.js plugin and pin specific versions for your environment.',
  configs: [{
    type: 'asdf-plugin',
    plugin: 'nodejs',
    versions: ['22.0.0', 'lts'],
  }]
}

const exampleFullInstall: ExampleConfig = {
  title: 'Full asdf setup — install, plugin, and version',
  description: 'Install asdf, add the Node.js plugin, and activate a specific version - a complete setup from scratch.',
  configs: [
    {
      type: 'asdf',
      plugins: ['nodejs'],
    },
    {
      type: 'asdf-plugin',
      plugin: 'nodejs',
    },
    {
      type: 'asdf-install',
      plugin: 'nodejs',
      versions: ['22.0.0'],
    },
  ]
}

const PLUGIN_LIST_REGEX = /^([^ ]+?)\s+([^ ]+)/

export class AsdfPluginResource extends Resource<AsdfPluginConfig> {
  getSettings(): ResourceSettings<AsdfPluginConfig> {
    return {
      id: 'asdf-plugin',
      defaultConfig,
      exampleConfigs: {
        example1: exampleNodejs,
        example2: exampleFullInstall,
      },
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

