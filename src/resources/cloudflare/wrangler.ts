import { CreatePlan, DestroyPlan, Resource, ResourceSettings, SpawnStatus, getPty, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { exampleDeployNewSite, exampleWranglerBasic } from './examples.js';
import { MIN_NODE_VERSION, compareVersions } from './wrangler-utils.js';

export const schema = z
  .object({})
  .meta({ $comment: 'https://codifycli.com/docs/resources/cloudflare/wrangler' })
  .describe('Wrangler, the Cloudflare developer platform CLI. Installed globally with npm and needs Node.js 22.12 or newer.');

export type WranglerConfig = z.infer<typeof schema>;

export class WranglerResource extends Resource<WranglerConfig> {
  getSettings(): ResourceSettings<WranglerConfig> {
    return {
      id: 'wrangler',
      defaultConfig: {},
      exampleConfigs: {
        example1: exampleWranglerBasic,
        example2: exampleDeployNewSite,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      // Node.js has to be installed first: wrangler is an npm package.
      dependencies: ['nvm', 'fnm', 'asdf-install', 'npm'],
    };
  }

  async refresh(): Promise<Partial<WranglerConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('which wrangler');
    return status === SpawnStatus.SUCCESS ? {} : null;
  }

  async create(_plan: CreatePlan<WranglerConfig>): Promise<void> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe('node --version', { interactive: true });
    if (status !== SpawnStatus.SUCCESS) {
      throw new Error('wrangler needs Node.js, which was not found. Add an "nvm" or "fnm" resource with the "lts" version.');
    }

    const nodeVersion = data.trim();
    if (compareVersions(nodeVersion, MIN_NODE_VERSION) < 0) {
      throw new Error(`wrangler needs Node.js ${MIN_NODE_VERSION} or newer, but ${nodeVersion} is active. Install the "lts" version with nvm or fnm and make it the global version.`);
    }

    await $.spawn('npm install -g wrangler', { interactive: true });
  }

  async destroy(_plan: DestroyPlan<WranglerConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn('npm uninstall -g wrangler', { interactive: true });
  }
}
