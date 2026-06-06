import { afterAll, describe, expect, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import * as path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { ResourceOperation } from '@codifycli/schemas';

const pluginPath = path.resolve('./src/index.ts');
const testDir = path.join(os.tmpdir(), 'codify-env-file-test');

describe('env-file resource integration tests', async () => {
  it('Can create, modify, and destroy a .env file with contents', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'env-file',
        dir: testDir,
        filename: '.env',
        contents: [
          { key: 'FOO', value: 'bar' },
          { key: 'BAZ', value: 'qux' },
        ],
      },
    ], {
      validateApply: async (plans) => {
        expect(plans[0].operation).to.eq(ResourceOperation.CREATE);
        const envPath = path.join(testDir, '.env');
        expect(fs.existsSync(envPath)).to.be.true;
        const content = fs.readFileSync(envPath, 'utf8');
        expect(content).to.include('FOO="bar"');
        expect(content).to.include('BAZ="qux"');
      },
      testModify: {
        modifiedConfigs: [
          {
            type: 'env-file',
            dir: testDir,
            filename: '.env',
            contents: [
              { key: 'FOO', value: 'updated' },
              { key: 'NEW_KEY', value: 'hello' },
            ],
          },
        ],
        validateModify: async (plans) => {
          expect(plans[0].operation).to.eq(ResourceOperation.MODIFY);
          const envPath = path.join(testDir, '.env');
          const content = fs.readFileSync(envPath, 'utf8');
          expect(content).to.include('FOO="updated"');
          expect(content).to.include('NEW_KEY="hello"');
        },
      },
      skipImport: true,
      validateDestroy: async () => {
        const envPath = path.join(testDir, '.env');
        expect(fs.existsSync(envPath)).to.be.false;
      },
    });
  });

  it('Can create, modify, and destroy multiple env files with env-files', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'env-files',
        dir: testDir,
        envFiles: [
          {
            name: '.env',
            contents: [{ key: 'APP_ENV', value: 'development' }],
          },
          {
            name: '.env.local',
            contents: [{ key: 'SECRET', value: 'abc123' }],
          },
        ],
      },
    ], {
      validateApply: async (plans) => {
        expect(plans[0].operation).to.eq(ResourceOperation.CREATE);
        expect(fs.existsSync(path.join(testDir, '.env'))).to.be.true;
        expect(fs.existsSync(path.join(testDir, '.env.local'))).to.be.true;
        expect(fs.readFileSync(path.join(testDir, '.env'), 'utf8')).to.include('APP_ENV="development"');
        expect(fs.readFileSync(path.join(testDir, '.env.local'), 'utf8')).to.include('SECRET="abc123"');
      },
      testModify: {
        modifiedConfigs: [
          {
            type: 'env-files',
            dir: testDir,
            envFiles: [
              {
                name: '.env',
                contents: [{ key: 'APP_ENV', value: 'production' }],
              },
            ],
          },
        ],
        validateModify: async (plans) => {
          expect(plans[0].operation).to.eq(ResourceOperation.MODIFY);
          expect(fs.readFileSync(path.join(testDir, '.env'), 'utf8')).to.include('APP_ENV="production"');
        },
      },
      skipImport: true,
      validateDestroy: async () => {
        expect(fs.existsSync(path.join(testDir, '.env'))).to.be.false;
      },
    });
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});
