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
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import {
  extractCodifyFileInfo,
  isRemoteCodifyFile,
  parseEnvFile,
  serializeEnvFile,
  writeRemoteCodifyFile,
} from './env-file-utils.js';

const envFileEntrySchema = z
  .object({
    name: z.string().describe('The name of the env file (e.g. .env, .env.local, .dev.vars).'),
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
  })
  .refine((d) => !(d.contents !== undefined && d.remoteFile !== undefined), {
    message: 'Only one of contents or remoteFile may be specified.',
  });

export type EnvFileEntry = z.infer<typeof envFileEntrySchema>;

const schema = z.object({
  dir: z.string().describe('The directory containing the env files.'),
  envFiles: z
    .array(envFileEntrySchema)
    .describe('The env files to manage in the specified directory.'),
});

export type EnvFilesConfig = z.infer<typeof schema>;

const defaultConfig: Partial<EnvFilesConfig> = {
  dir: '<Replace me here!>',
  envFiles: [],
};

const exampleCloudflare: ExampleConfig = {
  title: 'Manage Cloudflare Worker env files',
  description: 'Keep all environment files for a Cloudflare Workers project — development vars, local overrides, and production values — in sync across machines.',
  configs: [
    {
      type: 'env-files',
      dir: '~/projects/my-worker',
      envFiles: [
        {
          name: '.dev.vars',
          contents: [
            { key: 'API_TOKEN', value: '<Replace me here!>' },
            { key: 'ENVIRONMENT', value: 'development' },
          ],
        },
        {
          name: '.env.production',
          contents: [
            { key: 'API_TOKEN', value: '<Replace me here!>' },
            { key: 'ENVIRONMENT', value: 'production' },
          ],
        },
      ],
    },
  ],
};

const exampleRemote: ExampleConfig = {
  title: 'Sync multiple env files from Codify cloud',
  description: 'Pull several env files stored securely in Codify cloud and write them to a project directory so secrets are shared consistently across team members.',
  configs: [
    {
      type: 'env-files',
      dir: '~/projects/my-app',
      envFiles: [
        {
          name: '.env',
          remoteFile: 'codify://<Replace me here!>:<Replace me here!>',
        },
        {
          name: '.env.local',
          remoteFile: 'codify://<Replace me here!>:<Replace me here!>',
        },
      ],
    },
  ],
};

export class EnvFilesResource extends Resource<EnvFilesConfig> {
  getSettings(): ResourceSettings<EnvFilesConfig> {
    return {
      id: 'env-files',
      defaultConfig,
      exampleConfigs: {
        example1: exampleCloudflare,
        example2: exampleRemote,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        dir: { type: 'directory' },
        envFiles: {
          type: 'array',
          itemType: 'object',
          canModify: true,
          isSensitive: true,
          isElementEqual: (a: EnvFileEntry, b: EnvFileEntry) =>
            a.name === b.name &&
            a.remoteFile === b.remoteFile &&
            JSON.stringify(a.contents) === JSON.stringify(b.contents),
          filterInStatelessMode: (desired: EnvFileEntry[], current: EnvFileEntry[]) =>
            current.filter((c) => desired.some((d) => d.name === c.name)),
        },
      },
      isSensitive: true,
      allowMultiple: {
        identifyingParameters: ['dir'],
      },
    };
  }

  async refresh(parameters: Partial<EnvFilesConfig>): Promise<Partial<EnvFilesConfig> | null> {
    const { dir, envFiles } = parameters;
    if (!dir) return null;

    const resolvedDir = path.resolve(dir);

    if (!envFiles?.length) {
      return this.refreshFromDir(dir, resolvedDir);
    }

    const result: EnvFileEntry[] = [];

    for (const entry of envFiles) {
      const filePath = path.join(resolvedDir, entry.name);
      if (!(await FileUtils.fileExists(filePath))) continue;

      const content = await fs.readFile(filePath, 'utf8');

      if (entry.remoteFile) {
        result.push({ name: entry.name, remoteFile: entry.remoteFile });
      } else {
        result.push({ name: entry.name, contents: parseEnvFile(content) });
      }
    }

    if (result.length === 0) return null;
    return { dir, envFiles: result };
  }

  private async refreshFromDir(dir: string, resolvedDir: string): Promise<Partial<EnvFilesConfig> | null> {
    if (!(await FileUtils.dirExists(resolvedDir))) return null;

    const allFiles = await fs.readdir(resolvedDir);
    const envFileNames = allFiles.filter((f) => /^\.env(\..+)?$/.test(f) || f === '.dev.vars');

    const result: EnvFileEntry[] = [];

    for (const name of envFileNames) {
      const filePath = path.join(resolvedDir, name);
      const content = await fs.readFile(filePath, 'utf8');
      result.push({ name, contents: parseEnvFile(content) });
    }

    if (result.length === 0) return null;
    return { dir, envFiles: result };
  }

  async create(plan: CreatePlan<EnvFilesConfig>): Promise<void> {
    const resolvedDir = path.resolve(plan.desiredConfig.dir);

    if (!(await FileUtils.dirExists(resolvedDir))) {
      await fs.mkdir(resolvedDir, { recursive: true });
    }

    for (const entry of plan.desiredConfig.envFiles) {
      await this.writeEntry(resolvedDir, entry);
    }
  }

  async modify(pc: ParameterChange<EnvFilesConfig>, plan: ModifyPlan<EnvFilesConfig>): Promise<void> {
    if (pc.name !== 'envFiles') return;

    const resolvedDir = path.resolve(plan.desiredConfig.dir);

    const toRemove = (pc.previousValue as EnvFileEntry[])?.filter(
      (p) => !(pc.newValue as EnvFileEntry[])?.some((n) => n.name === p.name),
    );

    const toWrite = (pc.newValue as EnvFileEntry[])?.filter((n) => {
      const prev = (pc.previousValue as EnvFileEntry[])?.find((p) => p.name === n.name);
      if (!prev) return true;
      return (
        prev.remoteFile !== n.remoteFile ||
        JSON.stringify(prev.contents) !== JSON.stringify(n.contents)
      );
    });

    for (const entry of toRemove ?? []) {
      const filePath = path.join(resolvedDir, entry.name);
      if (await FileUtils.fileExists(filePath)) {
        await fs.rm(filePath);
      }
    }

    for (const entry of toWrite ?? []) {
      await this.writeEntry(resolvedDir, entry);
    }
  }

  async destroy(plan: DestroyPlan<EnvFilesConfig>): Promise<void> {
    const resolvedDir = path.resolve(plan.currentConfig.dir);

    for (const entry of plan.currentConfig.envFiles) {
      const filePath = path.join(resolvedDir, entry.name);
      if (await FileUtils.fileExists(filePath)) {
        await fs.rm(filePath);
      }
    }
  }

  private async writeEntry(resolvedDir: string, entry: EnvFileEntry): Promise<void> {
    const filePath = path.join(resolvedDir, entry.name);

    if (entry.remoteFile) {
      if (!isRemoteCodifyFile(entry.remoteFile)) {
        throw new Error(`Invalid remote file URL: ${entry.remoteFile}`);
      }
      const { documentId, fileId } = extractCodifyFileInfo(entry.remoteFile);
      await writeRemoteCodifyFile(documentId, fileId, filePath);
    } else {
      await fs.writeFile(filePath, serializeEnvFile(entry.contents ?? []), 'utf8');
    }
  }
}
