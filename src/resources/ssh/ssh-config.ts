import {
  ExampleConfig,
  getPty,
  Resource,
  ResourceSettings,
  z
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';
import { SshConfigHostsParameter } from './ssh-config-hosts-parameter.js';
import { SshKeyConfig } from './ssh-key.js';
import { exampleSshConfigs } from './examples.js';

export const schema = z.object({
  hosts: z.array(z.looseObject({
    Host: z.string().optional().describe('The host is usually the hostname argument given on the command line. Can accept ! and *'),
    Match: z.string().optional().describe('Restricts the following declarations (up to the next Host or Match keyword) to be used only when the conditions following the Match keyword are satisfied'),
    AddKeysToAgent: z.boolean().optional().describe('Specifies whether keys should be automatically added to a running ssh-agent(1)'),
    User: z.string().optional().describe('Specifies the user to log in as. This can be useful when a different user name is used on different machines'),
    UseKeychain: z.boolean().optional().describe('A UseKeychain option was introduced in macOS Sierra allowing users to specify whether they would like for the passphrase to be stored in the keychain'),
    IgnoreUnknown: z.string().optional().describe('Specifies a pattern-list of unknown options to be ignored if they are encountered in configuration parsing'),
    Port: z.number().optional().describe('Specifies the port number to connect on the remote host. The default is 22.'),
    IdentityFile: z.string().optional().describe('Specifies a file from which the user\'s ECDSA, authenticator-hosted ECDSA, Ed25519, authenticator-hosted Ed25519 or RSA authentication identity is read'),
    LogLevel: z.string().optional().describe('Gives the verbosity level that is used when logging messages from ssh(1).'),
    Compression: z.boolean().optional().describe('Specifies whether to use compression. The argument must be yes or no (the default).'),
    PreferredAuthentications: z.string().optional().describe('Specifies the order in which the client should try authentication methods.'),
    PasswordAuthentication: z.boolean().optional().describe('Specifies whether to use password authentication.'),
  }).describe('The individual host blocks inside of the ~/.ssh/config file')).describe('The host blocks inside of the ~/.ssh/config file. See http://man.openbsd.org/OpenBSD-current/man5/ssh_config.5 '),
})
  .describe('Configures the ssh config file.');

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

export type SshConfig = z.infer<typeof schema>;

const defaultConfig: Partial<SshConfig> = {
  hosts: [{
    Host: "*",
    AddKeysToAgent: true,
    UseKeychain: true,
    IdentityFile: "<Replace me here!>",
    IgnoreUnknown: "UseKeychain"
  }]
}

const exampleConfig: ExampleConfig = {
  title: 'Example ssh config',
  configs: [{
    type: 'ssh-config',
    hosts: [{
      Host: "*",
      AddKeysToAgent: true,
      UseKeychain: true,
      IdentityFile: "~/.ssh/id_ed25519",
      IgnoreUnknown: "UseKeychain"
    }]
  }]
}

export class SshConfigFileResource extends Resource<SshConfig> {
  getSettings(): ResourceSettings<SshConfig> {
    return {
      id: 'ssh-config',
      defaultConfig,
      exampleConfigs: {
        example1: exampleConfig,
        ...exampleSshConfigs
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      isSensitive: true,
      parameterSettings: {
        hosts: { stateful: new SshConfigHostsParameter() }
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
