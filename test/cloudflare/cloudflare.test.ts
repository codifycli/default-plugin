import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { SpawnStatus } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// The deploy test needs a real Cloudflare account that already has a workers.dev subdomain. Export an API token with
// the "Edit Cloudflare Workers" permissions and the account ID before running it, otherwise it is skipped.
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

describe('Cloudflare (wrangler) integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall wrangler', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      { type: 'nvm', nodeVersions: ['lts'], global: 'lts' },
      { type: 'wrangler' },
    ], {
      validateApply: async () => {
        const result = await testSpawn('wrangler --version');
        expect(result.status).toBe(SpawnStatus.SUCCESS);
      },
      validateDestroy: async () => {
        const result = await testSpawn('which wrangler');
        expect(result.status).toBe(SpawnStatus.ERROR);
      },
    });
  });

  it.skipIf(!apiToken || !accountId)('Can deploy a static site and delete it', { timeout: 600_000 }, async () => {
    const workerName = `codify-test-${Date.now()}`;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-cloudflare-'));
    await fs.mkdir(path.join(directory, 'public'));
    await fs.writeFile(path.join(directory, 'public', 'index.html'), '<h1>Deployed by Codify</h1>');

    const deploymentsList = `wrangler deployments list --name ${workerName} --json`;

    try {
      await PluginTester.fullTest(pluginPath, [
        { type: 'nvm', nodeVersions: ['lts'], global: 'lts' },
        { type: 'wrangler' },
        { type: 'cloudflare-worker', workerName, directory, assets: './public', accountId },
      ], {
        validateApply: async () => {
          const result = await testSpawn(deploymentsList);
          expect(result.status).toBe(SpawnStatus.SUCCESS);
        },
        validateDestroy: async () => {
          const result = await testSpawn(deploymentsList);
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
