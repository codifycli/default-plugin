import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

const pluginPath = path.resolve('./src/index.ts');

// Uninstall resources that have Codify resource definitions
await PluginTester.uninstall(pluginPath, [
  { type: 'docker' },
  { type: 'aws-cli'}
]);

await testSpawn('apt-get autoremove -y ruby rpm python awscli', { requiresRoot: true });

await testSpawn('rustup self uninstall -y');

await testSpawn('rm -rf /usr/bin/go', { requiresRoot: true })
await testSpawn('rm -rf /usr/bin/python', { requiresRoot: true })
await testSpawn('rm -rf /usr/bin/ruby', { requiresRoot: true })

// await testSpawn('apt install --reinstall command-not-found', { requiresRoot: true });
