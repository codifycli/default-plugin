import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import {
  EnvEntry,
  extractCodifyFileInfo,
  fetchRemoteCodifyFileHash,
  isRemoteCodifyFile,
  parseEnvFile,
  serializeEnvFile,
  writeRemoteCodifyFile,
} from './env-file-utils.js';

const schema = z
  .object({
    dir: z.string().describe('The directory where the env file is located.'),
    filename: z.string().optional().describe('The name of the env file. Defaults to .env.'),
    contents: z
      .array(
        z.object({
          key: z.string().describe('The environment variable key (conventionally UPPER_SNAKE_CASE).'),
          value: z.string().describe('The environment variable value.'),
        }),
      )
      .optional()
      .describe('Key-value pairs to write into the env file.'),
    remoteFile: z
      .string()
      .optional()
      .describe('Codify remote file reference (codify://<documentId>:<fileName>).'),
    hash: z.string().optional(),
  })
  .refine((d) => !(d.contents !== undefined && d.remoteFile !== undefined), {
    message: 'Only one of contents or remoteFile may be specified.',
  });

export type EnvFileConfig = z.infer<typeof schema>;

const defaultConfig: Partial<EnvFileConfig> = {
  dir: '<Replace me here!>',
  filename: '.env',
  contents: [],
};

const exampleContents: ExampleConfig = {
  title: 'Manage a project .env file',
  description: 'Declare the key-value pairs for a project .env file so they stay consistent across machines.',
  configs: [
    {
      type: 'env-file',
      dir: '~/projects/my-app',
      contents: [
        { key: 'DATABASE_URL', value: 'postgres://localhost:5432/mydb' },
        { key: 'API_KEY', value: '<Replace me here!>' },
        { key: 'DEBUG', value: 'false' },
      ],
    },
  ],
};

const exampleRemote: ExampleConfig = {
  title: 'Sync a .env file from Codify cloud',
  description: 'Pull a .env file stored securely in Codify cloud and write it to a project directory, keeping it in sync on every apply.',
  configs: [
    {
      type: 'env-file',
      dir: '~/projects/my-app',
      filename: '.env.local',
      remoteFile: 'codify://<Replace me here!>:<Replace me here!>',
    },
  ],
};

export class EnvFileResource extends Resource<EnvFileConfig> {
  getSettings(): ResourceSettings<EnvFileConfig> {
    return {
      id: 'env-file',
      defaultConfig,
      exampleConfigs: {
        example1: exampleContents,
        example2: exampleRemote,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        dir: { type: 'directory' },
        filename: { default: '.env' },
        contents: {
          type: 'array',
          itemType: 'object',
          canModify: true,
          isSensitive: true,
          isElementEqual: (a: EnvEntry, b: EnvEntry) => a.key === b.key && a.value === b.value,
        },
        remoteFile: { type: 'string', canModify: true },
        hash: { type: 'string', canModify: true },
      },
      allowMultiple: {
        identifyingParameters: ['dir', 'filename'],
      },
      isSensitive: true,
      transformation: {
        to: async (input: Partial<EnvFileConfig>) => {
          if (input.remoteFile && isRemoteCodifyFile(input.remoteFile)) {
            const { documentId, fileId } = extractCodifyFileInfo(input.remoteFile);
            const hash = await fetchRemoteCodifyFileHash(documentId, fileId);
            return { ...input, hash: hash ?? undefined };
          }
          return input;
        },
        from: async (input: Partial<EnvFileConfig>) => input,
      },
    };
  }

  async refresh(parameters: Partial<EnvFileConfig>): Promise<Partial<EnvFileConfig> | null> {
    const filePath = this.resolveFilePath(parameters.dir!, parameters.filename);

    if (!(await FileUtils.fileExists(filePath))) {
      return null;
    }

    const content = await fs.readFile(filePath, 'utf8');

    if (parameters.remoteFile) {
      const hash = createHash('md5').update(content).digest('hex');
      return { dir: parameters.dir, filename: parameters.filename, remoteFile: parameters.remoteFile, hash };
    }

    const contents = parseEnvFile(content);
    return { dir: parameters.dir, filename: parameters.filename, contents };
  }

  async create(plan: CreatePlan<EnvFileConfig>): Promise<void> {
    const { dir, filename, contents, remoteFile } = plan.desiredConfig;
    const resolvedDir = path.resolve(dir);
    const filePath = path.join(resolvedDir, filename ?? '.env');

    if (!(await FileUtils.dirExists(resolvedDir))) {
      await fs.mkdir(resolvedDir, { recursive: true });
    }

    if (remoteFile) {
      const { documentId, fileId } = extractCodifyFileInfo(remoteFile);
      await writeRemoteCodifyFile(documentId, fileId, filePath);
    } else {
      await fs.writeFile(filePath, serializeEnvFile(contents ?? []), 'utf8');
    }
  }

  async modify(pc: ParameterChange<EnvFileConfig>, plan: ModifyPlan<EnvFileConfig>): Promise<void> {
    return this.create(plan as unknown as CreatePlan<EnvFileConfig>);
  }

  async destroy(plan: DestroyPlan<EnvFileConfig>): Promise<void> {
    const filePath = this.resolveFilePath(plan.currentConfig.dir, plan.currentConfig.filename);
    await fs.rm(filePath);
  }

  private resolveFilePath(dir: string, filename?: string): string {
    return path.join(path.resolve(dir), filename ?? '.env');
  }
}
