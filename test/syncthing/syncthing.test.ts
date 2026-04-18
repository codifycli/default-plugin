import { SpawnStatus, Utils } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import * as path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

describe('Syncthing resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  // ── Basic install / uninstall ──────────────────────────────────────────────

  it('Can install and uninstall Syncthing', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [{ type: 'syncthing' }],
      {
        validateApply: async () => {
          expect(await testSpawn('which syncthing')).toMatchObject({
            status: SpawnStatus.SUCCESS,
          });

          if (Utils.isMacOS()) {
            const { data } = await testSpawn('brew services list');
            expect(data).toContain('syncthing');
          }

          if (Utils.isLinux()) {
            const result = await testSpawn('systemctl --user is-enabled syncthing');
            expect(result.status).toBe(SpawnStatus.SUCCESS);
          }
        },
        validateDestroy: async () => {
          expect(await testSpawn('which syncthing')).toMatchObject({
            status: SpawnStatus.ERROR,
          });
        },
      }
    );
  });

  // ── Global options ─────────────────────────────────────────────────────────

  it('Applies global options on install', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        {
          type: 'syncthing',
          globalAnnounceEnabled: false,
          relaysEnabled: false,
          urAccepted: -1,
          startBrowser: false,
        },
      ],
      {
        validateApply: async () => {
          expect(await testSpawn('which syncthing')).toMatchObject({
            status: SpawnStatus.SUCCESS,
          });

          const announceResult = await testSpawn(
            'syncthing cli config options global-ann-enabled get'
          );
          expect(announceResult.status).toBe(SpawnStatus.SUCCESS);
          expect(announceResult.data.trim()).toBe('false');

          const relaysResult = await testSpawn(
            'syncthing cli config options relays-enabled get'
          );
          expect(relaysResult.status).toBe(SpawnStatus.SUCCESS);
          expect(relaysResult.data.trim()).toBe('false');
        },
        validateDestroy: async () => {
          expect(await testSpawn('which syncthing')).toMatchObject({
            status: SpawnStatus.ERROR,
          });
        },
      }
    );
  });

  // ── Modify options ─────────────────────────────────────────────────────────

  it('Can modify global options after install', { timeout: 300_000 }, async () => {
    await PluginTester.fullTest(
      pluginPath,
      [
        {
          type: 'syncthing',
          relaysEnabled: true,
          maxSendKbps: 0,
          startBrowser: false,
        },
      ],
      {
        validateApply: async () => {
          const relaysResult = await testSpawn(
            'syncthing cli config options relays-enabled get'
          );
          expect(relaysResult.data.trim()).toBe('true');
        },
        testModify: {
          modifiedConfigs: [
            {
              type: 'syncthing',
              relaysEnabled: false,
              maxSendKbps: 1024,
              startBrowser: false,
            },
          ],
          validateModify: async () => {
            const relaysResult = await testSpawn(
              'syncthing cli config options relays-enabled get'
            );
            expect(relaysResult.data.trim()).toBe('false');

            const bwResult = await testSpawn(
              'syncthing cli config options max-send-kbps get'
            );
            expect(bwResult.data.trim()).toBe('1024');
          },
        },
        validateDestroy: async () => {
          expect(await testSpawn('which syncthing')).toMatchObject({
            status: SpawnStatus.ERROR,
          });
        },
      }
    );
  });

  // ── Folder resource ────────────────────────────────────────────────────────

  it('Can add and remove a shared folder', { timeout: 300_000 }, async () => {
    const testFolderPath = path.resolve('/tmp/syncthing-test-folder');

    await testSpawn(`mkdir -p ${testFolderPath}`);

    await PluginTester.fullTest(
      pluginPath,
      [
        { type: 'syncthing', startBrowser: false, urAccepted: -1 },
        {
          type: 'syncthing-folder',
          id: 'codify-test',
          path: testFolderPath,
          label: 'Codify Test Folder',
          folderType: 'sendreceive',
          fsWatcherEnabled: false,
          rescanIntervalS: 3600,
          maxConflicts: 0,
        },
      ],
      {
        validateApply: async () => {
          const listResult = await testSpawn('syncthing cli config folders list');
          expect(listResult.status).toBe(SpawnStatus.SUCCESS);

          expect(listResult.data).toContain('codify-test');
        },
        validateDestroy: async () => {
          expect(await testSpawn('which syncthing')).toMatchObject({
            status: SpawnStatus.ERROR,
          });
        },
      }
    );

    await testSpawn(`rm -rf ${testFolderPath}`);
  });

  // ── Device resource ────────────────────────────────────────────────────────

  it('Can add and remove a remote device', { timeout: 300_000 }, async () => {
    // Use a deterministic but fictitious device ID that Syncthing will accept
    const testDeviceId = 'MFZWI3D-BONSGYC-YLTMRWG-C43ENR5-QXGZDMM-FZWI3DP-BONSGYY-LTMRWAD';

    await PluginTester.fullTest(
      pluginPath,
      [
        { type: 'syncthing', startBrowser: false, urAccepted: -1 },
        {
          type: 'syncthing-device',
          deviceId: testDeviceId,
          deviceName: 'Codify Test Device',
          addresses: ['dynamic'],
          autoAcceptFolders: false,
          compression: 'metadata',
        },
      ],
      {
        validateApply: async () => {
          const listResult = await testSpawn('syncthing cli config devices list');
          expect(listResult.status).toBe(SpawnStatus.SUCCESS);

          expect(listResult.data).toContain(testDeviceId);
        },
        validateDestroy: async () => {
          expect(await testSpawn('which syncthing')).toMatchObject({
            status: SpawnStatus.ERROR,
          });
        },
      }
    );
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────

  afterAll(async () => {
    if (Utils.isMacOS()) {
      await testSpawn('brew services stop syncthing');
      await testSpawn('brew uninstall syncthing');
    } else {
      await testSpawn('systemctl --user stop syncthing');
      await testSpawn('systemctl --user disable syncthing');
      await testSpawn('sudo apt-get remove -y syncthing');
    }
  }, 60_000);
});
