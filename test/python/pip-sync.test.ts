import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { afterAll, describe, expect, it } from 'vitest'

describe('Pip-sync resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs python', { timeout: 500_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'uv',
        pythonVersions: ['3.11'],
        global: '3.11',
        tools: ['pip'],
      },
    ], {
      skipUninstall: true,
      validateApply: async () => {
        expect(testSpawn('python --version')).resolves.toMatchObject({ data: expect.stringContaining('3.11') });
      }
    })
  })

  it('Installs python and installs packages via pip-sync (in venv)', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        'type': 'git-repository',
        'directory': '~/Projects/example-project2',
        'repository': 'https://github.com/ImperialCollegeLondon/pip-tools-template.git'
      },
      {
        'type': 'venv-project',
        'envDir': '.venv',
        'cwd': '~/Projects/example-project2',
        'dependsOn': ['git-repository']
      },
      // The template's dev-requirements.txt pins pip-tools==7.4.1, which crashes on import with pip >= 25
      // (ImportError: stdlib_pkgs). Syncing it downgrades pip-tools inside the venv and breaks pip-sync itself,
      // so use a second requirements file we control instead.
      {
        'type': 'file',
        'path': '~/Projects/example-project2/extra-requirements.txt',
        'contents': 'six==1.17.0\n',
        'dependsOn': ['git-repository']
      },
      {
        'type': 'pip-sync',
        'cwd': '~/Projects/example-project2',
        'requirementFiles': ['requirements.txt', 'extra-requirements.txt'],
        'virtualEnv': '.venv',
        'dependsOn': ['venv-project', 'file']
      },
    ], {
      skipUninstall: true,
      skipImport: true,
      validatePlan(plans) {
        console.log(JSON.stringify(plans, null, 2))
      },
      async validateApply() {
        expect(await testSpawn('~/Projects/example-project2/.venv/bin/python -c "import six"'))
          .toMatchObject({ status: SpawnStatus.SUCCESS });
      },
    });
  });

  afterAll(async () => {
    await fs.rm(path.join(os.homedir(), 'Projects', 'example-project2'), { recursive: true, force: true });
    await PluginTester.uninstall(pluginPath, [{ type: 'uv' }]);
  }, 120_000);
})
