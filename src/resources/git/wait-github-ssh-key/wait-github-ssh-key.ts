import chalk from 'chalk';
import {
  CodifyCliSender,
  Resource,
  ResourceSettings,
  getPty
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface WaitGithubSshKeyConfig extends ResourceConfig {}

export class WaitGithubSshKey extends Resource<WaitGithubSshKeyConfig> {
  getSettings(): ResourceSettings<WaitGithubSshKeyConfig> {
    return {
      id: 'wait-github-ssh-key',
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: [
        'ssh-key',
        'ssh-add',
        'ssh-config',
      ]
    }
  }

  async refresh(): Promise<Partial<WaitGithubSshKeyConfig> | null> {
    const pty = getPty()

    const { data: githubConnectionStatus } = await pty.spawnSafe('ssh -o StrictHostKeychecking=no -T git@github.com 2>&1')
    if (githubConnectionStatus.includes('You\'ve successfully authenticated, but GitHub does not provide shell access.')) {
      return {};
    }

    return null;
  }

  async create(): Promise<void> {
    let attemptCount = 0;

    const publicKeys: string[] = []
    try {
      const sshFolder = path.join(os.homedir(), '.ssh');
      const publicKeysFiles = (await fs.readdir(sshFolder))
        .filter((name) => name.endsWith('.pub'));

      if (publicKeysFiles.length === 0) {
        throw new Error();
      }

      publicKeys.push(...(await Promise.all(publicKeysFiles.map(
        (name) => fs.readFile(path.join(sshFolder, name), 'utf8'))
      )));
    } catch {}

    do {
      if (attemptCount > 0) {
        console.error('Unable to verify that github ssh access is connected.')
      }

      await CodifyCliSender.requestPressKeyToContinuePrompt(
        (attemptCount > 0 ? chalk.redBright('Unable to verify that github ssh access is connected. Please try again. \n\n') : '') +
`${chalk.bold('Waiting for user to add ssh public to github')}
Add ssh public key to: ${chalk.underline('https://github.com/settings/ssh/new')}

${publicKeys.length > 0 
  ? `${chalk.bold('Public keys found:')}
${publicKeys.map((l, idx) => `${chalk.underline.italic(`key ${idx + 1}:\n`)}${l}`).join('\n')}  

Paste one of the above key/keys into github and then press any key to continue.`
  : 'No public keys were found in your .ssh folder. Please use a public key located elsewhere or visit: https://codifycli.com/docs/core-resources/ssh/ssh-key/ to generate an ssh key using Codify.'
}

For additional information visit: ${chalk.underline('https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account')}`
      )
      attemptCount++;
    } while(!(await this.isConnectedToGithub()));
  }

  async destroy(): Promise<void> {
    console.error('This resource cannot be destroyed. Skipping.')
  }

  private async isConnectedToGithub(): Promise<boolean> {
    const $ = getPty();
    const { data: githubConnectionStatus } = await $.spawnSafe('ssh -o StrictHostKeychecking=no -T git@github.com 2>&1')
    return githubConnectionStatus.includes('You\'ve successfully authenticated, but GitHub does not provide shell access.')
  }
}
