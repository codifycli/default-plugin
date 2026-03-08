import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';

describe('Git integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can add global user name and email', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'git',
        username: 'test',
        email: 'test@test.com'
      }
    ], {
      skipUninstall: true,
      validateApply: async () => {
        const email = await testSpawn('git config --global user.email')
        expect(email.data).to.contain('test@test.com')

        const username = await testSpawn('git config --global user.name')
        expect(username.data).to.contain('test')
      }
    });
  })

  it('Can modify git user name and email', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'git',
        username: 'test2',
        email: 'test2@test.com'
      }
    ], {
      // Set true here because git resource cannot be destroyed right now
      skipUninstall: true,
      validateApply: async () => {
        const email = await testSpawn('git config --global user.email')
        expect(email.data).to.contain('test2@test.com')

        const username = await testSpawn('git config --global user.name')
        expect(username.data).to.contain('test2')
      }
    });
  })
})
