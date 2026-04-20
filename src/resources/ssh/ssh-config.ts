import {
  getPty,
  Resource,
  ResourceSettings
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';
import { SshConfigHostsParameter } from './ssh-config-hosts-parameter.js';
import Schema from './ssh-config-schema.json';
import { SshKeyConfig } from './ssh-key.js';
import { exampleSshConfigs } from './examples.js';

export type SshConfigOptions = Partial<{
  Host: string;
  Match: string;
  HostName: string;
  User: string;
  Port: number;
  IdentityFile: string;
  LogLevel: string;
  Compression: boolean;
  PreferredAuthentications: string;
  AddKeysToAgent: boolean;
  UseKeychain: boolean;
  IgnoreUnknown: string;
  PasswordAuthentication: boolean;
}>

export interface SshConfig extends StringIndexedObject {
  hosts: Array<Partial<SshConfigOptions>>;
}

const defaultConfig: Partial<SshConfig> = {
  hosts: [{
    Host: "*",
    AddKeysToAgent: true,
    UseKeychain: true,
    IdentityFile: "~/.ssh/id_ed25519",
    IgnoreUnknown: "UseKeychain"
  }]
}

export class SshConfigFileResource extends Resource<SshConfig> {
  getSettings(): ResourceSettings<SshConfig> {
    return {
      id: 'ssh-config',
      defaultConfig,
      exampleConfigs: exampleSshConfigs,
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      isSensitive: true,
      parameterSettings: {
        hosts: { type: 'stateful', definition: new SshConfigHostsParameter() }
      },
      importAndDestroy: {
        refreshKeys: ['hosts'],
        defaultRefreshValues: { hosts: [] },
        requiredParameters: []
      },
      dependencies: ['ssh-key']
    }
  }

  async refresh(): Promise<Partial<SshConfig> | null> {
    const filePath = path.resolve(os.homedir(), '.ssh', 'config');

    if (!(await FileUtils.fileExists(filePath))) {
      return null;
    }

    return {};
  }

  async create(): Promise<void> {
    const folderPath = path.resolve(os.homedir(), '.ssh')
    const filePath = path.resolve(folderPath, 'config');

    if (!(await FileUtils.dirExists(folderPath))) {
      await fs.mkdir(path.join(os.homedir(), '.ssh'));
      await fs.chmod(path.join(os.homedir(), '.ssh'), 0o700);
    }

    if (!(await FileUtils.fileExists(filePath))) {
      await fs.writeFile(path.join(os.homedir(), '.ssh', 'config'), '');
      await fs.chmod(path.join(os.homedir(), '.ssh', 'config'), 0o600);
    }
  }

  async destroy(): Promise<void> {
    const filePath = path.resolve(os.homedir(), '.ssh', 'config');
    const deletedFilePath = path.resolve(os.homedir(), '.ssh', 'config_deleted_by_codify');

    console.log('Destroyed ssh config: $HOME/.ssh/config was by renaming it to config_deleted_by_codify')
    await fs.rename(filePath, deletedFilePath);
  }
}
