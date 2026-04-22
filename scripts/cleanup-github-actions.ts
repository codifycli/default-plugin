import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

const pluginPath = path.resolve('./src/index.ts');

// Uninstall resources that have Codify resource definitions
await PluginTester.uninstall(pluginPath, [
  { type: 'docker' },
]);

await testSpawn('apt-get autoremove -y golang ruby rpm python3 php', { requiresRoot: true })
