import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from 'codify-plugin-test';
import * as path from 'node:path';
import { SpawnStatus, Utils } from '@codifycli/plugin-core';

describe('Homebrew custom install integration tests', { skip: !Utils.isMacOS() }, () => {
  const pluginPath = path.resolve('./src/index.ts');

  it ('Creates brew in a custom location', { timeout: 300000 }, async () => {
    await PluginTester.uninstall(pluginPath, [{ type: 'homebrew' }])

    await PluginTester.fullTest(pluginPath, [{
      type: 'homebrew',
      directory: '~/.homebrew',
      formulae: [
        'sshpass',
      ],
    }], {
      validateApply: async () => {
        expect(await testSpawn('which sshpass')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which brew')).toMatchObject({ status: SpawnStatus.SUCCESS });
      }
    })
  })
})
