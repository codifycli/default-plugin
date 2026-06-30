import { afterAll, describe, expect, it } from 'vitest';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { SpawnStatus } from '@codifycli/schemas';

describe('Asdf install tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can install a .tool-versions file', { timeout: 600000 }, async () => {
    await fs.mkdir(path.join(os.homedir(), 'toolDir'), { recursive: true });
    await fs.writeFile(
      path.join(os.homedir(), '.tool-versions'),
      'deno 2.0.0\n' +
      'golang 1.23.0'
    )

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'asdf',
      },
      {
        type: 'asdf-install',
        directory: '~',
      },
    ], {
      validateApply: async () => {
        expect(await testSpawn('which asdf')).toMatchObject({ status: SpawnStatus.SUCCESS })
        expect(await testSpawn('which deno')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which go')).toMatchObject({ status: SpawnStatus.SUCCESS });

      },
      validateDestroy: async () => {
        expect(await testSpawn('which asdf')).toMatchObject({ status: SpawnStatus.ERROR });
        expect(await testSpawn('which deno')).toMatchObject({ status: SpawnStatus.ERROR });
        // Check the asdf shim is gone rather than `which go` — system Go may be pre-installed on the runner
        expect(await testSpawn('test -f ~/.asdf/shims/go')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });

    await fs.rm(path.join(os.homedir(), '.tool-versions'))
  })

  it('Can install a plugin and then a version', { timeout: 300000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'asdf',
        plugins: ['golang']
      },
      {
        type: 'asdf-install',
        plugin: 'golang',
        versions: ['latest']
      },
    ], {
      validateApply: async () => {
        expect(await testSpawn('which asdf;')).toMatchObject({ status: SpawnStatus.SUCCESS });
        expect(await testSpawn('which go')).toMatchObject({ status: SpawnStatus.SUCCESS });
      },
      validateDestroy: async () => {
        expect(await testSpawn('which asdf')).toMatchObject({ status: SpawnStatus.ERROR });
        // Check the asdf shim is gone rather than `which go` — system Go may be pre-installed on the runner
        expect(await testSpawn('test -f ~/.asdf/shims/go')).toMatchObject({ status: SpawnStatus.ERROR });
      }
    });
  })

  afterAll(async () => {
    const { status: isAsdf } = await testSpawn('which asdf');
    if (isAsdf === SpawnStatus.SUCCESS) {
      await PluginTester.uninstall(pluginPath, [{
        type: 'asdf',
      }])
    }

    await fs.rm(path.join(os.homedir(), '.tool-versions'), { recursive: true, force: true });
    await fs.rm('~/.asdf', { recursive: true, force: true });
  }, 300_000)
})
