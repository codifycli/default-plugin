import { ParameterSetting, Plan, StatefulParameter } from '@codifycli/plugin-core';
import isEqual from 'lodash.isequal';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SshConfig } from './ssh-config.js';

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

const SSH_CONFIG_REGEX = /(?=\bHost\b)|(?=\bMatch\b)/
const SSH_CONFIG_OPTION_REGEX = /(\S*)\s+(.*)/

export class SshConfigHostsParameter extends StatefulParameter<SshConfig, SshConfigOptions[]> {
  getSettings(): ParameterSetting {
    return {
      type: 'array',
      isElementEqual: 'object',
      filterInStatelessMode(desired, current) {
        return current.filter((c) => desired.some((d) => SshConfigHostsParameter.isHostObjectSame(c, d)))
      },
      transformation: {
        to: (hosts: SshConfigOptions[]) =>  hosts.map((h) => Object.fromEntries(
            Object.entries(h)
              .map(([k, v]) => [
                k,
                typeof v === 'boolean'
                  ? (v ? 'yes' : 'no') // The file takes 'yes' or 'no' instead of booleans
                  : v,
              ])
          )
        ),
        from: (hosts: SshConfigOptions[]) => hosts.map((h) => Object.fromEntries(
            Object.entries(h)
              .map(([k, v]) => [
                k,
                v === 'yes' || v === 'no'
                  ? (v === 'yes') // The file takes 'yes' or 'no' instead of booleans
                  : v,
              ])
          )
        ),
      }
    }
  }

  async refresh(): Promise<SshConfigOptions[] | null> {
    const filePath = path.resolve(os.homedir(), '.ssh', 'config');

    const sshConfigFile = await fs.readFile(filePath, 'utf8')
    const hostBlocks = this.parseHostBlocks(sshConfigFile);

    return this.parseHostObjects(hostBlocks);
  }
  
  async add(valueToAdd: SshConfigOptions[]): Promise<void> {
    const filePath = path.resolve(os.homedir(), '.ssh', 'config');

    const sshConfigFile = await fs.readFile(filePath, 'utf8');
    const hostBlocks = this.parseHostBlocks(sshConfigFile);

    for (const value of valueToAdd) {
      this.addHostBlock(hostBlocks, value);
    }

    await fs.writeFile(filePath, hostBlocks.join(''), 'utf8');
  }

  async remove(valueToRemove: SshConfigOptions[], plan: Plan<SshConfig>): Promise<void> {
    // Won't be called
  }

  async modify(newValue: SshConfigOptions[], previousValue: SshConfigOptions[], plan: Plan<SshConfig>): Promise<void> {
    const filePath = path.resolve(os.homedir(), '.ssh', 'config');

    const valuesToAdd: Array<Partial<SshConfigOptions>> = newValue.filter((v1: Partial<SshConfigOptions>) =>
      !previousValue.some((v2: Partial<SshConfigOptions>) => SshConfigHostsParameter.isHostObjectSame(v1, v2))
    );

    const valuesToRemove: Array<Partial<SshConfigOptions>> = previousValue.filter((v1: Partial<SshConfigOptions>) =>
      !newValue.some((v2: Partial<SshConfigOptions>) => SshConfigHostsParameter.isHostObjectSame(v1, v2))
    );

    valuesToRemove.push(...previousValue.filter((v1: Partial<SshConfigOptions>) =>
      newValue.some((v2: Partial<SshConfigOptions>) => SshConfigHostsParameter.isHostObjectSame(v1, v2) && !isEqual(v1, v2))
    ));

    valuesToAdd.push(...newValue.filter((v1: Partial<SshConfigOptions>) =>
      previousValue.some((v2: Partial<SshConfigOptions>) => SshConfigHostsParameter.isHostObjectSame(v1, v2) && !isEqual(v1, v2))
    ));

    const sshConfigFile = await fs.readFile(filePath, 'utf8');
    const hostBlocks = this.parseHostBlocks(sshConfigFile);

    for (const value of valuesToRemove) {
      this.removeHostBlock(hostBlocks, value);
    }

    for (const value of valuesToAdd) {
      this.addHostBlock(hostBlocks, value);
    }

    console.log(`Modifying .ssh/config file. Removing: ${valuesToRemove.map((v) => v.Host).join(', ')}. Adding ${valuesToAdd.map((v) => v.Host).join(', ')}.`);
    await fs.writeFile(filePath, hostBlocks.join(''), 'utf8');
  }

  static isHostObjectSame(h1: Partial<SshConfigOptions>, h2: Partial<SshConfigOptions>): boolean {
    if (h1.Host && h2.Host) {
      return h1.Host === h2.Host;
    }

    if (h1.Match && h2.Match) {
      return h1.Match === h2.Match;
    }

    return false;
  }

  private addHostBlock(hostBlocks: string[], host: Partial<SshConfigOptions>) {
    const lastBlock = hostBlocks.at(-1);

    let newLinesToAdd = 0;
    if (lastBlock) {
      newLinesToAdd = Math.max(0, 2 - this.calculateEndingNewLines(lastBlock));
    }

    const blockToAdd = this.hostObjectToString(host);
    hostBlocks.push('\n'.repeat(newLinesToAdd) + blockToAdd);
  }

  private removeHostBlock(hostBlocks: string[], host: Partial<SshConfigOptions>) {
    const index = hostBlocks.findIndex((b) => host.Host
      ? new RegExp('Host\\s*\\b' + host.Host + '\\b\\s+').test(b)
      : new RegExp('Match\\s*\\b' + host.Match + '\\b\\s+').test(b))

    if (index === -1) {
      return;
    }

    hostBlocks.splice(index, 1);
  }

  private hostObjectToString(h: Partial<SshConfigOptions>): string {
    const result = [];

    // Push host or match first. Either host or match is guaranteed to exist
    h.Host
      ? result.push(`Host ${h.Host}`)
      : result.push(`Match ${h.Match}`);

    const data = { ...h, Host: undefined, Match: undefined };
    Object.entries(data)
      .filter(([k, v]) => v !== undefined && v !== null)
      .forEach(([k, v]) => result.push(`  ${k} ${v}`))

    return result.join('\n');
  }

  private parseHostBlocks(sshConfigFile: string): string[] {
    return sshConfigFile
      .replaceAll(/#(.*)[\n\r]/g, '') // Remove all comments
      .split(SSH_CONFIG_REGEX)
      .filter(Boolean)
  }

  private parseHostObjects(hostBlocks: string[]): Array<Partial<SshConfigOptions>> {
    return hostBlocks
      .map((block) => {
        const options = block.split(/\n/)
          .filter(Boolean)
          .map((l) => l.trim())
          .map((l) => {
            const [_, option, value] = l.match(SSH_CONFIG_OPTION_REGEX) ?? [];
            if (!_ || !option || !value) {
              throw new Error(`Malformed .ssh/config file could not parse line: ${l}`)
            }

            return [option, value] as const;
          })

        return Object.fromEntries(options) as Partial<SshConfigOptions>;
      })
  }

  private calculateEndingNewLines(str: string): number {
    const previousBlockLines = str.split(/\n/)
    const previousBlockTrimmed = str.trimEnd();

    return previousBlockLines.length -  previousBlockTrimmed.split(/\n/).length;
  }

}
