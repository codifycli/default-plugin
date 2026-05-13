import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import { Utils } from '@codifycli/plugin-core';

const pluginPath = path.resolve('./src/index.ts');


if (Utils.isLinux()) {
  // Uninstall resources that have Codify resource definitions
  await PluginTester.uninstall(pluginPath, [
    { type: 'docker' },
    { type: 'aws-cli'}
  ]);

  await testSpawn('apt-get autoremove -y ruby rpm python awscli needrestart', { requiresRoot: true }); // remove needrestart to keep logs clean.

  await testSpawn('rustup self uninstall -y');

  await testSpawn('rm -rf /usr/bin/go', { requiresRoot: true })
  await testSpawn('rm -rf /usr/bin/python', { requiresRoot: true })
  await testSpawn('rm -rf /usr/bin/ruby', { requiresRoot: true })

// await testSpawn('apt install --reinstall command-not-found', { requiresRoot: true });

  // MacOS
} else {
  await PluginTester.uninstall(pluginPath, [
    { type: 'aws-cli' },
  ]);

  await testSpawn('brew uninstall ant gradle kotlin maven selenium-server google-chrome pipx $(brew list | grep -E \'^python(@|$)\') $(brew list | grep -E \'^ruby(@|$)\') aws-sam-cli azure-cli rustup git-lfs $(brew list | grep -E \'^openjdk(@|$)\')', { interactive: true });

}
