import { describe, expect, it } from 'vitest'
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('Pip resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs python', { timeout: 500000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'pyenv',
        pythonVersions: ['3.11'],
        global: '3.11'
      },
    ], {
      skipUninstall: true,
      validateApply: async () => {
        expect((await testSpawn('python --version')).data).to.include('3.11');
      }
    })
  })

  it('Installs python and installs a package using pip', { timeout: 300000 }, async () => {
    const requirementsPath = path.join(os.homedir(), 'requirements.txt')
    fs.writeFileSync(requirementsPath, 'aayush-color')

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'pip',
        install: [
          'ffmpeg',
          { name:  'qoverage', version:  "0.1.12"},
        ],
        installFiles: [requirementsPath]
      }
    ], {
      skipUninstall: true,
      validatePlan: (plans) => {
        console.log(JSON.stringify(plans, null, 2))
      },
      validateApply: async () => {
        const installedDependencies = await testSpawn('pip list --format=json --disable-pip-version-check');
        const parsed = JSON.parse(installedDependencies.data) as Array<{ name: string; version: string; }>;

        expect(parsed.some((p) => p.name === 'ffmpeg')).to.be.true;
        expect(parsed.some((p) => p.name === 'qoverage' && p.version === '0.1.12')).to.be.true;
      },
      testModify: {
        modifiedConfigs: [
          {
            type: 'pip',
            install: [
              'ffmpeg',
              'ansible-roster',
              { name:  'qoverage', version:  "0.1.13"},
            ]
          }
        ],
        validateModify: (plans) => {
          expect(plans.length).to.eq(1);
          const plan = plans[0];
          expect(plan).toMatchObject(  {
              "operation": "modify",
              "resourceType": "pip",
              "parameters": expect.arrayContaining([
                expect.objectContaining({
                  "name": "install",
                  "previousValue": [
                    "ffmpeg",
                    {
                      "name": "qoverage",
                      "version": "0.1.12"
                    }
                  ],
                  "newValue": [
                    "ffmpeg",
                    "ansible-roster",
                    {
                      "name": "qoverage",
                      "version": "0.1.13"
                    }
                  ],
                  "operation": "modify"
                })
              ])
            }
          )
        }
      }
    });
  });
})
