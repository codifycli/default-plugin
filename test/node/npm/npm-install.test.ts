import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('NpmInstall tests', () => {
  const pluginPath = path.resolve('./src/index.ts');
  let projectDir: string;

  beforeAll(async () => {
    // Ensure nvm + Node.js are available
    await PluginTester.install(pluginPath, [
      {
        type: 'nvm',
        global: '24',
        nodeVersions: ['24'],
      },
    ]);

    // Create a minimal npm project to run install against
    projectDir = path.join(os.tmpdir(), 'codify-npm-install-test');
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0', dependencies: { 'is-odd': '3.0.1' } }),
    );
  }, 500000);

  afterAll(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('Runs npm install in the specified directory', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        {
          type: 'npm-install',
          directories: [projectDir],
        },
      ],
      {
        skipUninstall: true,
        validateApply: async () => {
          const nodeModulesExists = await fs
            .access(path.join(projectDir, 'node_modules'))
            .then(() => true)
            .catch(() => false);
          expect(nodeModulesExists).toBe(true);

          const { status } = await testSpawn(
            `node -e "require('${path.join(projectDir, 'node_modules', 'is-odd')}')"`,
          );
          expect(status).toBe(SpawnStatus.SUCCESS);
        },
      },
    );
  });
});
