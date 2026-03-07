import { beforeEach, describe, expect, it } from 'vitest';
import { PluginTester } from 'codify-plugin-test';
import path from 'node:path';
import { ResourceOperation } from '@codifycli/schemas';
import fs from 'node:fs';
import os from 'node:os';

describe('File resource tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can create a file, modify the contents and delete it', { timeout: 300000 }, async () => {
    const contents = 'AWS_ACCESS_KEY_ID=\n' +
      'AWS_SECRET_ACCESS_KEY=\n' +
      'AWS_S3_ENDPOINT=\n' +
      'AWS_REGION=\n';

    await PluginTester.fullTest(pluginPath, [
      { type: 'file',
        path: '~/.env',
        contents
      }
    ], {
      validateApply: (plans) => {
        expect(plans[0]).toMatchObject({
          operation: ResourceOperation.CREATE,
        })

        expect(fs.readFileSync(path.resolve(os.homedir(), '.env'), 'utf-8')).to.eq(contents);
      },
      testModify: {
        modifiedConfigs: [{
          type: 'file',
          path: '~/.env',
          contents: 'testing\ntest',
        }],
        validateModify: (plans) => {
          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
          })
          expect(fs.readFileSync(path.resolve(os.homedir(), '.env'), 'utf-8')).to.eq('testing\ntest');
        }
      },
      validateDestroy: () => {
        expect(fs.existsSync(path.resolve(os.homedir(), '.env'))).to.be.false;
      }
    })
  })

  it('Will throw an error if the path given is a directory', { timeout: 300000 }, async () => {
    fs.mkdirSync(path.resolve(os.homedir(), 'tmp'))

    await expect(async () => PluginTester.fullTest(pluginPath, [
      { type: 'file', path: '~/tmp', contents: 'anything' }
    ])).rejects.toThrow();
  })

  it('Will not modify a file if already created and onlyCreate is set to true', { timeout: 300000 }, async () => {
    const filePath = path.resolve(os.homedir(), 'testFile');
    fs.writeFileSync(filePath, 'this is the previous file', 'utf-8')

    await PluginTester.fullTest(pluginPath, [
      { type: 'file', path: filePath, contents: 'anything', onlyCreate: true }
    ], {
      skipUninstall: true,
      validatePlan(plans) {
        expect(plans[0]).toMatchObject({
          operation: ResourceOperation.NOOP,
        })
      }
    })

    expect(fs.readFileSync(filePath, 'utf-8')).to.eq('this is the previous file');
  })
})
