import {
  CreatePlan,
  DestroyPlan,
  getPty,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  z
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';
import { escapeSingleQuoted } from '../../utils/shell-escape.js';
import { exampleSshConfigs } from './examples.js';

export const schema = z.object({
  keyType: z.enum(['ecdsa', 'ecdsa-sk', 'ed25519', 'ed25519-sk', 'rsa']).optional().describe('The type of key to create (the encryption algorithm used). This corresponds to the -t flag of ssh-keygen. This value defaults to ed25519.'),
  comment: z.string().optional().describe('Comment to add to the ssh key. Changing this value will not re-create the ssh key'),
  fileName: z.string().optional().describe('Specifies the filename of the key file. This corresponds to the -f flag of ssh-keygen'),
  bits: z.number().optional().describe('Specifies the number of bits in the key to create. This corresponds to the -b flag of ssh-keygen.'),
  passphrase: z.string().describe('The passphrase to use. This parameter is required. To set an empty password set the value to the empty string: ""'),
  folder: z.string().optional().describe('The folder to generate the ssh key in. Defaults to `$HOME/.ssh`'),
})
  .describe('Generate and manage a ssh private/public key.');

export type SshKeyType = 'ecdsa' | 'ecdsa-sk' | 'ed25519' | 'ed25519-sk' | 'rsa';

export type SshKeyConfig = z.infer<typeof schema>;

const defaultConfig: Partial<SshKeyConfig> = {
  keyType: 'ed25519',
  passphrase: '',
}

// "<bits> <hash algorithm>:<fingerprint> <comment> (<type>)". The comment can contain spaces, or be "no comment".
const SSH_KEYGEN_FINGERPRINT_REGEX = /^(\d+) (\S+):(\S+) (.*) \((\S+)\)$/

/** Parses the output of `ssh-keygen -l -f <key>` */
export function parseSshKeygenFingerprint(output: string): { bits: number; comment: string; type: string } | null {
  const line = output.trim().split(/\r?\n/).at(-1) ?? '';
  const [, bits, , , comment, type] = line.trim().match(SSH_KEYGEN_FINGERPRINT_REGEX) ?? [];
  if (!bits || !type) {
    return null;
  }

  return { bits: Number.parseInt(bits, 10), comment: comment === 'no comment' ? '' : comment, type: type.toLowerCase() };
}

/** Quotes a value as a single shell argument */
function shellArg(value: string): string {
  return `'${escapeSingleQuoted(value)}'`;
}

export class SshKeyResource extends Resource<SshKeyConfig> {
  getSettings(): ResourceSettings<SshKeyConfig> {
    return {
      id: 'ssh-key',
      defaultConfig: defaultConfig,
      exampleConfigs: exampleSshConfigs,
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
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

    const { data, status } = await $.spawnSafe(`ssh-keygen -l -f ${shellArg(keyPath)}`);
    const fingerprint = status === SpawnStatus.SUCCESS ? parseSshKeygenFingerprint(data) : null;
    if (!fingerprint) {
      // The file exists, so report it as existing: planning a create would make ssh-keygen ask to overwrite it.
      console.error(`Unable to read the ssh key ${keyPath}: ${data}`);
      return {
        fileName: parameters.fileName,
        passphrase: parameters.passphrase,
        folder: parameters.folder!,
      };
    }

    const currentConfig: Partial<SshKeyConfig> = {
      fileName: parameters.fileName,
      passphrase: parameters.passphrase,
      folder: parameters.folder!,
    };

    if (parameters.bits) {
      currentConfig.bits = fingerprint.bits;
    }

    if (parameters.keyType) {
      currentConfig.keyType = fingerprint.type as SshKeyType;
    }

    if (parameters.comment) {
      currentConfig.comment = fingerprint.comment;
    }

    return currentConfig;
  }

  override async create(plan: CreatePlan<SshKeyConfig>): Promise<void> {
    const $ = getPty();
    const { folder, fileName, keyType, passphrase, comment, bits } = plan.desiredConfig;
    const keyPath = path.join(folder!, fileName!);

    // Never overwrite a key: ssh-keygen would wait forever for an answer to "Overwrite (y/n)?". The key can appear
    // between plan and apply, ex: gh auth login offers to generate one.
    if (await FileUtils.fileExists(keyPath)) {
      throw new Error(
        `The ssh key ${keyPath} already exists (it was created after the plan was generated). ` +
        'Codify does not overwrite ssh keys: run the plan again to manage the existing key, or delete it first.'
      );
    }

    if (!(await FileUtils.dirExists(folder!))) {
      await fs.mkdir(folder!, { recursive: true, mode: 0o700 });
    }

    const command = [
      'ssh-keygen',
      `-f ${shellArg(keyPath)}`,
      `-t ${keyType}`,
      `-N ${shellArg(passphrase ?? '')}`,
    ];

    if (comment) {
      command.push(`-C ${shellArg(comment)}`);
    }

    if (bits) {
      command.push(`-b ${bits}`);
    }

    await $.spawn(command.join(' '));
  }

  override async modify(pc: ParameterChange<SshKeyConfig>, plan: ModifyPlan<SshKeyConfig>): Promise<void> {
    const $ = getPty();
    const keyPath = path.join(plan.desiredConfig.folder!, plan.desiredConfig.fileName!);
    const passphrase = plan.desiredConfig.passphrase ?? '';

    if (pc.name === 'comment') {
      await $.spawn(`ssh-keygen -c -f ${shellArg(keyPath)} -P ${shellArg(passphrase)} -C ${shellArg(pc.newValue ?? '')}`);
      return;
    }

    // Passphrase can't be called in stateless mode because we don't know what the previous password is
    if (pc.name === 'passphrase') {
      await $.spawn(`ssh-keygen -p -f ${shellArg(keyPath)} -P ${shellArg(pc.previousValue ?? '')} -N ${shellArg(pc.newValue ?? '')}`);
    }
  }

  override async destroy(plan: DestroyPlan<SshKeyConfig>): Promise<void> {
    const keyPath = path.join(plan.currentConfig.folder!, plan.currentConfig.fileName!);

    await fs.rm(keyPath, { force: true });
    await fs.rm(`${keyPath}.pub`, { force: true });
  }
}
