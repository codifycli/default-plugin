import { afterEach, beforeEach, describe, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import path from 'node:path';
import { Utils } from '@codifycli/plugin-core';

describe('Ssh Add tests', { skip: Utils.isMacOS() }, () => {
  const pluginPath = path.resolve('./src/index.ts');

  // Currently having a hard time testing this because it cannot start the agent and keep it alive via ssh.
  it('Can generate and then add key to ssh-agent + keychain', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'ssh-key',
        fileName: 'id_ed25519',
        passphrase: ''
      },
      {
        type: 'ssh-config',
        hosts: [
          {
            Host: '*',
            AddKeysToAgent: true,
            IdentityFile: 'id_ed25519'
          }
        ]
      },
      {
        type: 'ssh-add',
        path: '~/.ssh/id_ed25519',
      }
    ])
  })

})
