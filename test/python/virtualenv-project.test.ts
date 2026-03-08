import { describe, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Utils } from '@codifycli/plugin-core';

describe('Virtualenv project tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install and uninstall a virtualenv directory', { timeout: 300000 }, async () => {
    await fs.mkdir('Projects/python-project', { recursive: true });
    await fs.writeFile('Projects/python-project/requirements.txt', 'is-num==0.0.2')

    console.log(await fs.readdir('Projects/python-project'));

    await PluginTester.fullTest(pluginPath, [
      { type: 'virtualenv' },
      { type: 'pyenv', pythonVersions: ['3.11'], global: '3.11' },
      { type: 'virtualenv-project', dest: '.venv', cwd: 'Projects/python-project', automaticallyInstallRequirementsTxt: true },
    ])
  })
})
