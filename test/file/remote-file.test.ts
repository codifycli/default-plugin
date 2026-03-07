import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginTester } from 'codify-plugin-test';
import * as path from 'node:path';
import fs from 'node:fs';
import { ResourceOperation } from '@codifycli/schemas';

describe('File integration tests', { skip: true }, async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can download a file from codify cloud', { timeout: 300000 }, async () => {
    process.env.VITE_CODIFY_TEST_JWT = '';
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'remote-file',
        path: './my_test_file',
        remote: 'codify://14d1c15b-baa9-47fb-a298-a50a9d809687:test_file.env',
      }
    ], {
      validateApply: async (plans) => {
        expect(plans[0].operation).to.eq(ResourceOperation.CREATE);

        expect(fs.existsSync('./my_test_file')).to.be.true;
        const contents = fs.readFileSync('./my_test_file', 'utf8');
        expect(contents).to.eq(`MY_VAR_1=abcdef
MY_VAR_2=123456

MY_SUPER_SECRET_VAR=********`);
      },
      validateImport: async (importResults) => {
        expect(fs.existsSync('./my_test_file')).to.be.true;

        expect(importResults[0].parameters).toMatchObject({
          path: './my_test_file',
          remote: 'codify://14d1c15b-baa9-47fb-a298-a50a9d809687:test_file.env',
          hash: 'cec9d0e430250854ac683f062ef71547'
        })
      },
      validateDestroy: async () => {
        expect(fs.existsSync('./my_test_file')).to.be.false;
      }
    });
  })

  afterAll(() => {
    if (fs.existsSync('./my_test_file')) {
      fs.rmSync('./my_test_file');
    }
  })
})
