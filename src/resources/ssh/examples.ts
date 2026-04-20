import { ExampleConfigs } from '@codifycli/plugin-core';

export const exampleSshConfigs: ExampleConfigs = {
  example2: {
    title: 'Example git ssh setup',
    configs: [
      {
        "type": "ssh-key",
        "passphrase": ""
      },
      {
        "type": "ssh-config",
        "hosts": [{
          "Host": "github.com",
          "AddKeysToAgent": true,
          "UseKeychain": true,
          "IdentityFile": "~/.ssh/id_ed25519",
          "IgnoreUnknown": "UseKeychain"
        }]
      },
      {
        "type": "ssh-add",
        "path": "~/.ssh/id_ed25519",
        "appleUseKeychain": true,
        "os": ["macOS"],
        "dependsOn": ["ssh-config"]
      },
      {
        "type": "ssh-add",
        "path": "~/.ssh/id_ed25519",
        "os": ["linux"],
        "dependsOn": ["ssh-config"]
      },
      {
        "type": 'wait-github-ssh-key',
        "dependsOn": ["ssh-config"]
      },
      {
        "type": 'git-repository',
        "parentDirectory": '~/projects',
        "repositories": ['<Replace me here!>', '<Replace me here!>']
      }
    ],
    description: 'Configures GitHub SSH access for cloning, pulling, and pushing. Generates a new id_ed25519 key and provides step-by-step guidance for uploading it to GitHub.'
  },
}
