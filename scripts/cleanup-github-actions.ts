import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import { Utils } from '@codifycli/plugin-core';

const pluginPath = path.resolve('./src/index.ts');

// Uninstall resources that have Codify resource definitions
await PluginTester.uninstall(pluginPath, [
  { type: 'docker' },
  { type: 'aws-cli'}
]);

if (Utils.isLinux()) {
  await testSpawn('apt-get autoremove -y ruby rpm python awscli needrestart', { requiresRoot: true }); // remove needrestart to keep logs clean.

  await testSpawn('rustup self uninstall -y');

  await testSpawn('rm -rf /usr/bin/go', { requiresRoot: true })
  await testSpawn('rm -rf /usr/bin/python', { requiresRoot: true })
  await testSpawn('rm -rf /usr/bin/ruby', { requiresRoot: true })

// await testSpawn('apt install --reinstall command-not-found', { requiresRoot: true });

  // MacOS
} else {
  await PluginTester.uninstall(pluginPath, [
    { type: 'brew', formulae: ['chrome', 'python', 'ruby', 'awscli']  },
  ]);
}
