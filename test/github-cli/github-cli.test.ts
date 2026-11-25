import {PluginTester, testSpawn} from '@codifycli/plugin-test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {SpawnStatus} from "@codifycli/schemas";

describe('GitHub CLI integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    const result = await testSpawn('which gh');

    if (result.status === SpawnStatus.SUCCESS) {
      await PluginTester.uninstall(pluginPath, [{type: 'github-cli'}]);
    }
  }, 60_000);

  it('Can install and uninstall GitHub CLI', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'github-cli' }],
      {
        validateApply: async () => {
          const result = await testSpawn('which gh');
          expect(result.status).toBe(SpawnStatus.SUCCESS);
        },
        validateDestroy: async () => {
          const result = await testSpawn('which gh');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );
  });

  it('Can install GitHub CLI and configure git_protocol', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        {
          type: 'github-cli',
          gitProtocol: 'https',
          prompt: 'enabled',
        },
      ],
      {
        validateApply: async () => {
          const result = await testSpawn('gh config get git_protocol');
          expect(result.status).toBe(SpawnStatus.SUCCESS);
          expect(result.data.trim()).toBe('https');
        },
        testModify: {
          modifiedConfigs: [
            {
              type: 'github-cli',
              gitProtocol: 'ssh',
              prompt: 'enabled',
            },
          ],
          validateModify: async () => {
            const result = await testSpawn('gh config get git_protocol');
            expect(result.data.trim()).toBe('ssh');
          },
        },
        validateDestroy: async () => {
          const result = await testSpawn('which gh');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );
  });

  it('Can create and delete a gh alias', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        { type: 'github-cli' },
        {
          type: 'github-cli-alias',
          alias: 'codify-test-alias',
          expansion: 'pr list',
        },
      ],
      {
        validateApply: async () => {
          const result = await testSpawn('gh alias list');
          expect(result.status).toBe(SpawnStatus.SUCCESS);
          expect(result.data).toContain('codify-test-alias');
        },
        testModify: {
          modifiedConfigs: [
            {
              type: 'github-cli-alias',
              alias: 'codify-test-alias',
              expansion: 'pr status',
            },
          ],
          validateModify: async () => {
            const result = await testSpawn('gh alias list');
            expect(result.data).toContain('pr status');
          },
        },
        validateDestroy: async () => {
          const result = await testSpawn('gh alias list');
          if (result.status === SpawnStatus.SUCCESS) {
            expect(result.data).not.toContain('codify-test-alias');
          }
        },
      }
    );
  });

  // Needs a classic personal access token of a throwaway GitHub account with the admin:public_key scope:
  // GH_TEST_TOKEN=ghp_... npm run test:integration -- test/github-cli
  it.skipIf(!process.env.GH_TEST_TOKEN)('Can upload and delete an SSH key on GitHub', { timeout: 300_000 }, async () => {
    const keyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-gh-ssh-key-'));
    const keyFile = path.join(keyDir, 'id_ed25519');
    await testSpawn(`ssh-keygen -t ed25519 -N "" -C codify-test -f "${keyFile}"`);
    const publicKey = (await fs.readFile(`${keyFile}.pub`, 'utf8')).split(' ').slice(0, 2).join(' ');

    const title = `codify-test-${Date.now()}`;
    const listKeys = () => testSpawn(`gh api user/keys --jq '.[].key'`);

    await PluginTester.fullTest(
      pluginPath,
      [
        { type: 'github-cli' },
        { type: 'github-cli-auth', token: process.env.GH_TEST_TOKEN, scopes: ['admin:public_key'] },
        { type: 'github-cli-ssh-key', title, keyFile: `${keyFile}.pub` },
      ],
      {
        validateApply: async () => {
          const result = await listKeys();
          expect(result.status).toBe(SpawnStatus.SUCCESS);
          expect(result.data).toContain(publicKey);
        },
        validateDestroy: async () => {
          const result = await testSpawn('which gh');
          expect(result.status).toBe(SpawnStatus.ERROR);
        },
      }
    );

    await fs.rm(keyDir, { recursive: true, force: true });
  });
});
