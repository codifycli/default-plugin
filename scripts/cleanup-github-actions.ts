import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';

const pluginPath = path.resolve('./src/index.ts');

// Uninstall resources that have Codify resource definitions
await PluginTester.uninstall(pluginPath, [
  { type: 'docker' },
]);

await testSpawn('apt-get autoremove -y golang docker-ce python rust ruby rpm python3 python php', { requiresRoot: true })

// Remove pre-installed tools that don't have Codify resources
// Python — remove all python-related binaries and symlinks
await testSpawn('bash -c \'rm -f /usr/bin/python* /usr/local/bin/python*\'', { requiresRoot: true });


// Go
await testSpawn('bash -c \'rm -f /usr/bin/go* /usr/local/bin/go* && rm -rf /usr/local/go\'', { requiresRoot: true });

// Ruby — remove binaries and gems
await testSpawn('bash -c \'rm -f /usr/bin/ruby* /usr/local/bin/ruby* /usr/bin/gem* /usr/local/bin/gem*\'', { requiresRoot: true });

// Zig
await testSpawn('bash -c \'rm -f /usr/bin/zig* /usr/local/bin/zig*\'', { requiresRoot: true });

// Google Cloud SDK
await testSpawn('rm -rf /opt/google/google-cloud-sdk', { requiresRoot: true });

// Apache Maven
await testSpawn('rm -rf /usr/local/apache-maven', { requiresRoot: true });

// Gradle
await testSpawn('rm -rf /usr/local/gradle-*', { requiresRoot: true });

// Yarn (installed via ~/.yarn and ~/.config/yarn)
await testSpawn('rm -rf ~/.yarn ~/.config/yarn');

// Docker — remove user-level config and data directories
await testSpawn('rm -rf ~/.docker');

