import { CreatePlan, DestroyPlan, Resource, ResourceSettings, SpawnStatus, getPty, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { exampleDeployNewSite, exampleWranglerAuthDevice } from './examples.js';
import { parseWhoami } from './wrangler-utils.js';

export const schema = z
  .object({
    device: z
      .boolean()
      .optional()
      .describe('Log in with a device code instead of the localhost callback. Use this in VMs, containers and SSH sessions where the browser can\'t reach the machine. Defaults to false.'),
    useKeyring: z
      .boolean()
      .optional()
      .describe('Store the OAuth credentials in the OS keychain instead of a plaintext file. Defaults to false.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/cloudflare/wrangler-auth' })
  .describe('Log wrangler in to Cloudflare through the browser. New users can sign up for a free account on the same page. Being logged in through the CLOUDFLARE_API_TOKEN environment variable also counts.');

export type WranglerAuthConfig = z.infer<typeof schema>;

export class WranglerAuthResource extends Resource<WranglerAuthConfig> {
  getSettings(): ResourceSettings<WranglerAuthConfig> {
    return {
      id: 'wrangler-auth',
      defaultConfig: {},
      exampleConfigs: {
        example1: exampleDeployNewSite,
        example2: exampleWranglerAuthDevice,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['wrangler'],
      parameterSettings: {
        device: { type: 'boolean', setting: true },
        useKeyring: { type: 'boolean', setting: true },
      },
    };
  }

  async refresh(): Promise<Partial<WranglerAuthConfig> | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('wrangler whoami --json');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    return parseWhoami(data) ? {} : null;
  }

  async create(plan: CreatePlan<WranglerAuthConfig>): Promise<void> {
    const $ = getPty();
    const { device, useKeyring } = plan.desiredConfig;

    const flags = [device ? ' --device' : '', useKeyring ? ' --use-keyring' : ''].join('');
    await $.spawn(`wrangler login${flags}`, { interactive: true, stdin: true });
  }

  async destroy(_plan: DestroyPlan<WranglerAuthConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn('wrangler logout', { interactive: true });
  }
}
