import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

const pluginPath = path.resolve('./src/index.ts');

// Uninstall resources that have Codify resource definitions
await PluginTester.uninstall(pluginPath, [
  { type: 'pyenv' },
  { type: 'rbenv' },
  { type: 'uv' },
]);

// Remove pre-installed tools that don't have Codify resources
// Go
await testSpawn('rm -rf /usr/local/go', { requiresRoot: true });

// Google Cloud SDK
await testSpawn('rm -rf /opt/google/google-cloud-sdk', { requiresRoot: true });

// Apache Maven
await testSpawn('rm -rf /usr/local/apache-maven', { requiresRoot: true });

// Gradle
await testSpawn('rm -rf /usr/local/gradle-*', { requiresRoot: true });

// Yarn (installed via ~/.yarn and ~/.config/yarn)
await testSpawn('rm -rf ~/.yarn ~/.config/yarn');

