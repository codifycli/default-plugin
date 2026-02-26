import {
  CreatePlan,
  DestroyPlan,
  getPty,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from 'codify-schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';
import Schema from './ssh-key-schema.json';

export type SshKeyType = 'ecdsa' | 'ecdsa-sk' | 'ed25519' | 'ed25519-sk' | 'rsa';

export interface SshKeyConfig extends StringIndexedObject {
  keyType: SshKeyType;
  comment?: string;
  fileName: string;
  bits?: number;
  passphrase: string;
  folder: string;
}

const SSH_KEYGEN_FINGERPRINT_REGEX = /^(\d+) (.*):(.*) (.*) \((.*)\)$/

export class SshKeyResource extends Resource<SshKeyConfig> {
  getSettings(): ResourceSettings<SshKeyConfig> {
    return {
      id: 'ssh-key',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        comment: { canModify: true },
        passphrase: { canModify: true, isSensitive: true },
        folder: { type: 'directory', default: '~/.ssh' }
      },
      importAndDestroy:{
        requiredParameters: ['fileName'],
        defaultRefreshValues: {
          passphrase: '',
        }
      },
      transformation: {
        to(input) {
          if (!input.keyType) {
            input.keyType = 'ed25519';
          }

          if (!input.fileName) {
            input.fileName = `id_${input.keyType}`;
          }

          return input;
        },
        from: (output) => output,
      },
      allowMultiple: {
        identifyingParameters: ['fileName'],
        async findAllParameters() {
          try {
            const sshPublicKeys = await fs.readdir(path.join(os.homedir(), '.ssh'));

            return sshPublicKeys.filter((p) => {
              if (!p.endsWith('.pub')) {
                return false;
              }

              // We only want public / private pairs.
              const name = p.slice(0, - 4);
              return sshPublicKeys.includes(name)
            }).map((p) => ({ fileName: p.slice(0, - 4) }))
          } catch {
            return [];
          }
        }
      }
    }
  }

  override async refresh(parameters: Partial<SshKeyConfig>): Promise<Partial<SshKeyConfig> | null> {
    const $ = getPty();

    if (!(await FileUtils.dirExists(parameters.folder!))) {
      return null;
    }

    const keyPath = path.join(parameters.folder!, parameters.fileName!);
    if (!(await FileUtils.fileExists(keyPath))) {
      return null;
    }

    const { data: existingKey } = await $.spawn(`ssh-keygen -l -f ${parameters.fileName}`, { cwd: parameters.folder! });
    const [_, bits, __, ___, comment, type] = existingKey
      .trim()
      .match(SSH_KEYGEN_FINGERPRINT_REGEX) ?? [];

    if (!bits || !type) {
      console.error(`Unable to parse ssh keygen output: ${_}`)
      return null;
    }

    const currentConfig: Partial<SshKeyConfig> = {
      fileName: parameters.fileName,
      passphrase: parameters.passphrase,
      folder: parameters.folder!,
    };

    if (parameters.bits) {
      currentConfig.bits = Number.parseInt(bits, 10);
    }

    if (parameters.keyType) {
      currentConfig.keyType = type.toLowerCase() as SshKeyType;
    }

    if (parameters.comment) {
      currentConfig.comment = comment;
    }

    return currentConfig;
  }

  override async create(plan: CreatePlan<SshKeyConfig>): Promise<void> {
    const folderPath = path.resolve(os.homedir(), '.ssh')
    const $ = getPty();

    if (!(await FileUtils.dirExists(folderPath))) {
      await fs.mkdir(folderPath);
      await fs.chmod(folderPath, 0o700);
    }

    const command = [
      'ssh-keygen',
      `-f "${plan.desiredConfig.fileName}"`,
      `-t ${plan.desiredConfig.keyType}`,
      `-P "${plan.desiredConfig.passphrase}"`
    ]

    if (plan.desiredConfig.comment) {
      command.push(`-C "${plan.desiredConfig.comment}"`);
    }

    if (plan.desiredConfig.bits) {
      command.push(`-b ${plan.desiredConfig.bits}`);
    }

    await $.spawn(command.join(' '), { cwd: plan.desiredConfig.folder })
  }

  override async modify(pc: ParameterChange<SshKeyConfig>, plan: ModifyPlan<SshKeyConfig>): Promise<void> {
    const $ = getPty();
    if (pc.name === 'comment') {
      await $.spawn(`ssh-keygen -f ${plan.desiredConfig.fileName} -c -C "${pc.newValue}"`, { cwd: plan.desiredConfig.folder! })
      return;
    }

    // Passphrase can't be called in stateless mode because we don't know what the previous password is
    if (pc.name === 'passphrase') {
      await $.spawn(`ssh-keygen -f ${plan.desiredConfig.fileName} -N ${pc.newValue} -P ${pc.previousValue} -p`, { cwd: plan.desiredConfig.folder! })
    }
  }

  override async destroy(plan: DestroyPlan<SshKeyConfig>): Promise<void> {
    const keyPath = path.join(plan.currentConfig.folder!, plan.currentConfig.fileName!);

    await fs.rm(keyPath);
    await fs.rm(`${keyPath}.pub`);
  }
}
