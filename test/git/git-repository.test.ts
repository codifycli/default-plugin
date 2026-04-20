import { afterAll, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

describe('Git repository integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install git repo to specified dir', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'git-repository',
        directory: '~/projects/nested/codify-plugin',
        repository: 'https://github.com/kevinwang5658/untitled.git'
      }
    ], {
      skipUninstall: true,
      validatePlan: async (plans) => {
        console.log('plans', plans);
      },
      validateApply: async () => {
        const location = path.join(os.homedir(), 'projects', 'nested', 'codify-plugin');
        const lstat = await fs.lstat(location);

        expect(lstat.isDirectory()).to.be.true;

        const { data: repoInfo } = await testSpawn('git config --get remote.origin.url', { cwd: location });
        expect(repoInfo.trim()).to.eq('https://github.com/kevinwang5658/untitled.git')
      }
    });
  })

  afterAll(async () => {
    await fs.rm(path.join(os.homedir(), 'projects', 'nested'), { recursive: true, force: true });
  })
})
