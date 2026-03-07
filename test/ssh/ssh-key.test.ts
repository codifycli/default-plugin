import { describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SpawnStatus } from '@codifycli/plugin-core';

describe('Ssh key tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can generate and delete an ssh key', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'ssh-key',
        passphrase: '',
      }
    ], {
      validateApply: async () => {
        expect(fs.existsSync(path.resolve(os.homedir(), '.ssh', 'id_ed25519'))).to.be.true;
        expect(fs.existsSync(path.resolve(os.homedir(), '.ssh', 'id_ed25519.pub'))).to.be.true;

        expect(await testSpawn(`ls -l ${path.resolve(os.homedir(), '.ssh', 'id_ed25519')}`))
          .toMatchObject({
            data: expect.stringContaining('-rw-------')
          }) // 600 permissions. Only owner can read and write

        expect(await testSpawn(`ls -l ${path.resolve(os.homedir(), '.ssh', 'id_ed25519.pub')}`))
          .toMatchObject({
            data: expect.stringContaining('-rw-r--r--')
          }) // 644 permissions. Only owner can read and write. Everyone else can read.

        expect(await testSpawn(`ssh-keygen -y -f ${path.resolve(os.homedir(), '.ssh', 'id_ed25519')}`)).toMatchObject({
          status: SpawnStatus.SUCCESS,
        })
      },
      testModify: {
        modifiedConfigs: [{
          type: 'ssh-key',
          comment: 'commenting',
        }],
        validateModify: (plans) => {
          expect(plans[0]).toMatchObject({
            "operation": "modify",
            "resourceType": "ssh-key",
            "parameters": expect.arrayContaining([
              expect.objectContaining({
                "name": "comment",
                "newValue": "commenting",
                "operation": "modify"
              })
            ])
          })

          const location = path.resolve(os.homedir(), '.ssh', 'id_ed25519.pub');
          const key = fs.readFileSync(location).toString('utf-8');
          expect(key).to.include('commenting'); // updated comment
        }
      },
      validateDestroy: () => {
        expect(fs.existsSync(path.resolve(os.homedir(), '.ssh', 'id_ed25519'))).to.be.false;
        expect(fs.existsSync(path.resolve(os.homedir(), '.ssh', 'id_ed25519.pub'))).to.be.false;
      }
    })
  })

  it('Can generate and delete a custom key', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'ssh-key',
        keyType: "rsa",
        bits: 3072,
        comment: 'person@email.com',
        fileName: 'custom_key_name',
        passphrase: 'password',
        folder: '~',
      }
    ], {
      validateApply: () => {
        expect(fs.existsSync(path.resolve(os.homedir(), 'custom_key_name'))).to.be.true;
        expect(fs.existsSync(path.resolve(os.homedir(), 'custom_key_name.pub'))).to.be.true;
      },
      validateDestroy: () => {
        expect(fs.existsSync(path.resolve(os.homedir(), 'custom_key_name'))).to.be.false;
        expect(fs.existsSync(path.resolve(os.homedir(), 'custom_key_name.pub'))).to.be.false;
      }
    })
  })
})
