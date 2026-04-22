import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { ParameterOperation, ResourceOperation } from '@codifycli/schemas';
import { TestUtils } from '../test-utils.js';

describe('Path resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can add a path to shell rc', { timeout: 300000 }, async () => {
    const tempDir1 = await fs.mkdtemp(os.tmpdir() + '/');
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'path',
        path: tempDir1,
      }
    ], {
      validateApply: async () => {
        expect((await testSpawn('echo $PATH', { interactive: true })).data).to.include(tempDir1);
      },
      validateDestroy: async () => {
        expect((await testSpawn('echo $PATH', { interactive: true })).data).to.not.include(tempDir1);
      }
    });
  })

  it('Can add multiple paths to shell rc', { timeout: 300000 }, async () => {
    const tempDir1 = await fs.mkdtemp(os.tmpdir() + '/');
    const tempDir2 = await fs.mkdtemp(os.tmpdir() + '/');

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'path',
        paths: [tempDir1, tempDir2],
      }
    ], {
      validatePlan: (plan) => {
        console.log(JSON.stringify(plan, null, 2));
      },
      validateApply: async () => {
        const { data: path } = await testSpawn('echo $PATH', { interactive: true })
        expect(path).to.include(tempDir1);
        expect(path).to.include(tempDir2);
      },
      validateDestroy: async () => {
        const { data: path } = await testSpawn('echo $PATH', { interactive: true })
        expect(path).to.not.include(tempDir1);
        expect(path).to.not.include(tempDir2);
      }
    });
  })

  it('Can prepend multiple paths to shell rc', { timeout: 300000 }, async () => {
    const tempDir1 = await fs.mkdtemp(os.tmpdir() + '/');
    const tempDir2 = await fs.mkdtemp(os.tmpdir() + '/');

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'path',
        paths: [tempDir1, tempDir2],
        prepend: true,
      }
    ], {
      validateApply: async () => {
        const { data: path } = await testSpawn('echo $PATH', { interactive: true });

        console.log('My path', path);
        console.log('Temp dir 1', tempDir1);
        console.log('Temp  dir 2', tempDir2);
        console.log('Zshrc', await fs.readFile(`${os.homedir()}/.zshrc`, 'utf-8'))

        expect(path).to.include(tempDir1);
        expect(path).to.include(tempDir2);
      },
      validateDestroy: async () => {
        const { data: path } = await testSpawn('echo $PATH', { interactive: true })
        expect(path).to.not.include(tempDir1);
        expect(path).to.not.include(tempDir2);
      }
    });
  })

  it('Can modify an existing path resource to add additional paths to shell rc', { timeout: 300000 }, async () => {
    const tempDir1 = await fs.mkdtemp(os.tmpdir() + '/');
    const tempDir2 = await fs.mkdtemp(os.tmpdir() + '/');
    const tempDir3 = await fs.mkdtemp(os.tmpdir() + '/');
    const tempDir4 = await fs.mkdtemp(os.tmpdir() + '/');

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'path',
        paths: [tempDir1, tempDir2],
        prepend: true,
      }
    ], {
      validateApply: async () => {
        const { data: path } = await testSpawn('echo $PATH', { interactive: true })
        expect(path).to.include(tempDir1);
        expect(path).to.include(tempDir2);
      },
      testModify: {
        modifiedConfigs: [{
          type: 'path',
          paths: [tempDir1, tempDir2, tempDir3, tempDir4],
          prepend: true,
        }],
        validateModify: async (plans) => {
          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
            parameters: expect.arrayContaining([expect.objectContaining({
              name: 'paths',
              previousValue: expect.arrayContaining([tempDir2, tempDir1]),
              newValue: expect.arrayContaining([tempDir1, tempDir2, tempDir3, tempDir4]),
              operation: ParameterOperation.MODIFY,
            })])
          })

          const { data: path } = await testSpawn('echo $PATH', { interactive: true })
          expect(path).to.include(tempDir1);
          expect(path).to.include(tempDir2);
          expect(path).to.include(tempDir3);
          expect(path).to.include(tempDir4);
        }
      },
      validateDestroy: async () => {
        const { data: path } = await testSpawn('echo $PATH', { interactive: true })
        expect(path).to.not.include(tempDir1);
        expect(path).to.not.include(tempDir2);
        expect(path).to.not.include(tempDir3);
        expect(path).to.not.include(tempDir4);
      }
    });
  })

  it('Supports tildy for home', { timeout: 300000 }, async () => {
    await fs.mkdir(path.resolve(os.homedir(), 'temp', 'dir'), { recursive: true });
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'path',
        path: '~/temp/dir',
      }
    ]);
  })
})
