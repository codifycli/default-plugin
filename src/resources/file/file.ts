import { CreatePlan, DestroyPlan, ExampleConfig, ModifyPlan, ParameterChange, Resource, ResourceSettings, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../utils/file-utils.js';

const schema = z.object({
    path: z.string().describe('The location of the file.'),
    contents: z.string().describe('The contents of the file.'),
    onlyCreate: z
      .boolean()
      .describe(
        'Forces the resource to only create the file if it doesn\'t exist but don\'t detect any content changes.'
      )
      .optional()
  })    .meta({ $comment: 'https://codifycli.com/docs/resources/scripting/file' })

type FileConfig = z.infer<typeof schema>;

const defaultConfig: Partial<FileConfig> = {
  path: '<Replace me here!>',
  contents: '',
}

const exampleDotfile: ExampleConfig = {
  title: 'Manage a dotfile with declarative contents',
  description: 'Create and keep a configuration file in sync with the exact contents specified — useful for dotfiles like .curlrc or .wgetrc.',
  configs: [{
    type: 'file',
    path: '~/.curlrc',
    contents: '--silent\n--location\n--retry 3\n',
  }]
}

const exampleOnlyCreate: ExampleConfig = {
  title: 'Bootstrap a file only if it does not exist',
  description: 'Write an initial .env file on first run without overwriting any local edits made afterwards.',
  configs: [{
    type: 'file',
    path: '~/.config/myapp/.env',
    contents: 'API_URL=https://api.example.com\nDEBUG=false\n',
    onlyCreate: true,
  }]
}

export class FileResource extends Resource<FileConfig> {
  getSettings(): ResourceSettings<FileConfig> {
    return {
      id: 'file',
      defaultConfig,
      exampleConfigs: {
        example1: exampleDotfile,
        example2: exampleOnlyCreate,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        path: { type: 'directory' },
        contents: { canModify: true },
        onlyCreate: { type: 'boolean', setting: true },
      },
      importAndDestroy:{
        requiredParameters: ['path']
      },
      allowMultiple: {
        identifyingParameters: ['path']
      }
    }
  }

  async refresh(parameters: Partial<FileConfig>): Promise<Partial<FileConfig> | Partial<FileConfig>[] | null> {
    const filePath  = parameters.path!;

    if (!(await FileUtils.exists(filePath))) {
      return null;
    }

    const isFile = (await fs.lstat(filePath)).isFile()
    if (!isFile) {
      throw new Error(`A directory exists at ${filePath}`)
    }

    // If we only care that the contents of the file is created then there's no point checking the contents
    const { onlyCreate } = parameters;
    if (onlyCreate) {
      return parameters;
    }

    const contents = (await fs.readFile(filePath)).toString('utf8');
    return {
      path: parameters.path,
      contents,
      onlyCreate,
    }
  }

  async create(plan: CreatePlan<FileConfig>): Promise<void> {
    const { contents, path } = plan.desiredConfig;

    await fs.writeFile(path, contents, 'utf8');
  }

  async modify(pc: ParameterChange<FileConfig>, plan: ModifyPlan<FileConfig>): Promise<void> {
    const filePath = path.resolve(plan.desiredConfig.path!);
    const { contents } = plan.desiredConfig;

    await fs.writeFile(filePath, contents, 'utf8');
  }

  async destroy(plan: DestroyPlan<FileConfig>): Promise<void> {
    await fs.rm(path.resolve(plan.currentConfig.path));
  }
}
