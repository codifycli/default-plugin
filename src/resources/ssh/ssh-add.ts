import { CreatePlan, DestroyPlan, getPty, Resource, ResourceSettings, SpawnStatus, Utils } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';
import Schema from './ssh-add-schema.json'

export interface SshAddConfig extends StringIndexedObject {
  path: string;
  appleUseKeychain: boolean,
}

const APPLE_KEYCHAIN_REGEX = /Identity added: (.*) \((.*)\)/;

export class SshAddResource extends Resource<SshAddConfig> {
  getSettings(): ResourceSettings<SshAddConfig> {
    return {
      id: 'ssh-add',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        path: {
          type: 'directory'
        },
        appleUseKeychain: {
          type: 'boolean'
        }
      },
      allowMultiple: {
        identifyingParameters: ['path']
      },
      dependencies: ['ssh-key', 'ssh-config']
    }
  }

  async refresh(parameters: Partial<SshAddConfig>): Promise<Partial<SshAddConfig> | null> {
    const $ = getPty();

    const sshPath = parameters.path!;
    if (!(await FileUtils.fileExists(sshPath))) {
      return null;
    }

    const { data: keyFingerprint, status: keygenStatus } = await $.spawnSafe(`ssh-keygen -lf ${sshPath}`);
    if (keygenStatus === SpawnStatus.ERROR) {
      return null;
    }

    const { data: loadedSshKeys, status: sshAddStatus } = await $.spawnSafe('/usr/bin/ssh-add -l');
    if (sshAddStatus === SpawnStatus.ERROR) {
      return null;
    }

    const matchedFingerprint = loadedSshKeys
      .trim()
      .split(/\n/)
      .filter(Boolean)
      .find((l) => l.trim() === keyFingerprint.trim());

    if (!matchedFingerprint) {
      return null;
    }
    
    let appleUseKeychain: boolean | undefined;
    if (parameters.appleUseKeychain) {
      appleUseKeychain = Utils.isMacOS() ? (await this.isKeyLoadedInKeychain(sshPath)) : parameters.appleUseKeychain;
    }

    return {
      path: sshPath,
      appleUseKeychain,
    };
  }

  async create(plan: CreatePlan<SshAddConfig>): Promise<void> {
    const { appleUseKeychain, path } = plan.desiredConfig;
    const $ = getPty();

    if (Utils.isLinux()) {
      if ((await $.spawnSafe('ssh-agent -l')).status === SpawnStatus.ERROR) {
        await FileUtils.addToStartupFile('eval "$(ssh-agent -s)"');
      }

      await FileUtils.addToStartupFile('ssh-add ' + path);
    }

    if (Utils.isMacOS()) {
      await $.spawn(`/usr/bin/ssh-add ${appleUseKeychain && Utils.isMacOS() ? '--apple-use-keychain ' : ''}${path}`, {
        interactive: true,
        stdin: true
      });
    }
  }

  async destroy(plan: DestroyPlan<SshAddConfig>): Promise<void> {
    const { path } = plan.currentConfig;

    if (Utils.isLinux()) {
      await FileUtils.removeLineFromStartupFile('ssh-add ' + path);
    }


    const $ = getPty();
    await $.spawnSafe(`/usr/bin/ssh-add -d ${path}`, { interactive: true });
  }

  private async isKeyLoadedInKeychain(keyPath: string): Promise<boolean> {
    if (!Utils.isMacOS()) {
      return false;
    }


   const $ = getPty();
    const { data: keychainKeys, status } = await $.spawnSafe('/usr/bin/ssh-add --apple-load-keychain', { interactive: true });
    if (status === SpawnStatus.ERROR) {
      return false;
    }

    return keychainKeys.trim()
      .split(/\n/)
      .filter(Boolean)
      .map((l) => {
        const [line, path, comment] = l.trim().match(APPLE_KEYCHAIN_REGEX) ?? [];
        return { line, path, comment };
      })
      .some((result) => path.resolve(keyPath) === path.resolve(result.path))
  }

}
