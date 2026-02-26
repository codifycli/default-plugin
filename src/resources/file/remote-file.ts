import {
  CodifyCliSender,
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
  ParameterChange,
  RefreshContext,
  Resource,
  ResourceSettings
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';
import { createHash } from 'node:crypto';
import * as fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import trash from 'trash';

import { FileUtils } from '../../utils/file-utils.js';
import schema from './remote-file-schema.json'

export interface FileConfig extends ResourceConfig{
  path: string;
  remote?: string;
  hash?: string;
  onlyCreate: boolean;
}

export class RemoteFileResource extends Resource<FileConfig> {
  getSettings(): ResourceSettings<FileConfig> {
    return {
      id: 'remote-file',
      operatingSystems: [OS.Darwin, OS.Linux],
      allowMultiple: true,
      schema,
      parameterSettings: {
        path: { type: 'directory' },
        remote: { type: 'string', canModify: true },
        onlyCreate: { type: 'boolean', setting: true, default: false },
        hash: { type: 'string', canModify: true },
      },
      transformation: {
        to: async (input: Partial<FileConfig>) => {
          if (this.isRemoteCodifyFile(input.remote!)) {
            return this.getRemoteCodifyFileConfig(input)
          }

          return input;
        },
        from: async (input: Partial<FileConfig>) => input,
      }
    }
  }

  async refresh(parameters: Partial<FileConfig>, context: RefreshContext<FileConfig>): Promise<Partial<FileConfig> | null> {
    if (!parameters.path) {
      throw new Error('Path must be specified');
    }

    if (!(await FileUtils.exists(parameters.path))) {
      return null;
    }

    const current = await fs.readFile(parameters.path, 'utf8');
    const currentHash = createHash('md5').update(current).digest('hex');

    return {
      ...parameters,
      hash: parameters.onlyCreate ? parameters.hash : currentHash,
    }
  }

  async create(plan: CreatePlan<FileConfig>): Promise<void> {
    return this.updateCodifyFile(plan.desiredConfig);
  }
  
  async modify(pc: ParameterChange<FileConfig>, plan: ModifyPlan<FileConfig>): Promise<void> {
    return this.updateCodifyFile(plan.desiredConfig);
  }

  destroy(plan: DestroyPlan<FileConfig>): Promise<void> {
    return trash(plan.currentConfig.path);
  }

  private async updateCodifyFile(config: FileConfig) {
    const { path: filePath, remote } = config;
    const resolvedPath = path.resolve(filePath);

    if (!(await FileUtils.dirExists(path.dirname(resolvedPath)))) {
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    }

    if (this.isRemoteCodifyFile(remote!)) {
      const { documentId, fileId } = this.extractCodifyFileInfo(remote!);
      const fileStream = fsSync.createWriteStream(filePath, { flags: 'wx' });

      const credentials = await CodifyCliSender.getCodifyCliCredentials();
      const response = await fetch(`https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${credentials}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Unable to fetch file ${remote}, ${await response.text()}`);
      }

      console.log(`Updating file ${filePath} with contents from ${remote}`);
      await finished(Readable.fromWeb(response.body as any).pipe(fileStream));
    } else {
      console.log(`Updating file ${filePath} with contents`);
      await fs.writeFile(filePath, remote ?? '');
    }

    console.log(`Finished updating file ${filePath}`);
  }

  private isRemoteCodifyFile(contents: string) {
    return contents?.startsWith('codify://');
  }

  private async getRemoteCodifyFileConfig(parameters: Partial<FileConfig>): Promise<Partial<FileConfig>> {
    const { documentId, fileId } = this.extractCodifyFileInfo(parameters.remote!);

    const credentials = await CodifyCliSender.getCodifyCliCredentials();
    const response = await fetch((`https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}/hash`), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${credentials}`,
      },
    });

    if (!response.ok) {
      return {
        ...parameters,
        hash: undefined,
      }
    }

    const data = await response.json();

    return {
      ...parameters,
      hash: data.hash,
    };
  }

  private extractCodifyFileInfo(url: string) {
    const regex = /codify:\/\/(.*):(.*)/

    const [, group1, group2] = regex.exec(url) ?? [];
    if (!group1 || !group2) {
      throw new Error(`Invalid codify url ${url} for file`);
    }

    return {
      documentId: group1,
      fileId: group2,
    }
  }
}
