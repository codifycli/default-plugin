import { describe, it, expect, beforeAll } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

function npmrcPath() {
  return path.resolve(os.homedir(), '.npmrc');
}

describe('Npm login tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    await PluginTester.install(pluginPath, [
      {
        type: 'nvm',
        global: '24',
        nodeVersions: ['24'],
      }
    ]);
  }, 600000);

  it('Can write token and scoped registry mapping to ~/.npmrc and remove on destroy', { timeout: 600000 }, async () => {
    const scope = '@codify';
    const registry = 'https://registry.npmjs.org/';
    const token = 'abc123';

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'npm-login',
        scope,
        registry,
        authToken: token,
      }
    ], {
      validateApply: async () => {
        const file = await fs.readFile(npmrcPath(), 'utf8');
        expect(file).toContain(`${scope}:registry=${registry}`);
        expect(file).toContain(`//registry.npmjs.org/:_authToken=${token}`);
      },
      validateDestroy: async () => {
        const file = await fs.readFile(npmrcPath(), 'utf8').catch(() => '');
        expect(file).not.toContain(`${scope}:registry=${registry}`);
        expect(file).not.toContain(`//registry.npmjs.org/:_authToken=${token}`);
      }
    });
  });

  it('Can change registry and move token while updating scope mapping', { timeout: 600000 }, async () => {
    const scope = '@codify';
    const initialRegistry = 'https://registry.npmjs.org/';
    const newRegistry = 'https://registry.yarnpkg.com/';
    const token = 'xyz789';

    // First apply initial state and keep it (skipUninstall) so we can modify
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'npm-login',
        scope,
        registry: initialRegistry,
        authToken: token,
      }
    ], {
      skipUninstall: true,
      validateApply: async () => {
        const file = await fs.readFile(npmrcPath(), 'utf8');
        expect(file).toContain(`${scope}:registry=${initialRegistry}`);
        expect(file).toContain(`//registry.npmjs.org/:_authToken=${token}`);
      }
    });

    // Now modify to a new registry and validate token moved and scope updated
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'npm-login',
        scope,
        registry: newRegistry,
        authToken: token,
      }
    ], {
      validateApply: async () => {
        const file = await fs.readFile(npmrcPath(), 'utf8');
        console.log(file);

        expect(file).toContain(`${scope}:registry=${newRegistry}`);
        expect(file).toContain(`//registry.yarnpkg.com/:_authToken=${token}`);
        expect(file).not.toContain(`${scope}:registry=${initialRegistry}`);
        // expect(file).not.toContain(`//registry.npmjs.org/:_authToken=${token}`);
      },
      validateDestroy: async () => {
        const file = await fs.readFile(npmrcPath(), 'utf8').catch(() => '');
        expect(file).not.toContain(`${scope}:registry=${newRegistry}`);
        expect(file).not.toContain(`//registry.yarnpkg.com/:_authToken=${token}`);
      }
    });
  });
});
