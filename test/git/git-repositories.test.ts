import { afterAll, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';

describe('Git repositories integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install git repos to parent dir', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'git-repositories',
        parentDirectory: '~/projects/test',
        repositories: ['https://github.com/kevinwang5658/untitled.git', 'https://github.com/octocat/Hello-World.git']
      }
    ], {
      skipUninstall: true, // Can't directly delete repos via codify currently.
      validateApply: async () => {
        const location = path.join(os.homedir(), 'projects', 'test', 'untitled');
        const lstat = await fs.lstat(location);

        expect(lstat.isDirectory()).to.be.true;
        console.log(await fs.readdir(location));

        const { data: repoInfo } = await testSpawn('git config --get remote.origin.url', { cwd: location });
        console.log(repoInfo);
        expect(repoInfo).to.eq('https://github.com/kevinwang5658/untitled.git')
      }
    });
  })

  afterAll(async () => {
    await fs.rm(path.join(os.homedir(), 'projects', 'test'), { recursive: true, force: true });
  })
})
