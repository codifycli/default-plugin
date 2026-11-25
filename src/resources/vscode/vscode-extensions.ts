import {
  ExampleConfig,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';

import { ExtensionsParameter, getCodeBinary } from './extensions-parameter.js';

export const schema = z
  .object({
    extensions: z
      .array(z.string())
      .describe('VS Code extension ids to install, e.g. ["ms-python.python", "charliermarsh.ruff"]. Extensions that are installed but not listed are left alone.'),
    directory: z
      .string()
      .optional()
      .describe('The directory VS Code is installed in (macOS). Defaults to /Applications.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/vscode-extensions' })
  .describe(
    'Install a list of VS Code extensions into an existing VS Code install. Can be declared several times (give each a name), ' +
    'e.g. one list per language, and only manages the extensions it lists.'
  );

export type VscodeExtensionsConfig = z.infer<typeof schema>;

const defaultConfig: Partial<VscodeExtensionsConfig> = {
  extensions: [],
};

const examplePython: ExampleConfig = {
  title: 'Python extensions for VS Code',
  description: 'Add the Python and Ruff extensions to VS Code without touching the extensions you already have.',
  configs: [
    {
      type: 'vscode-extensions',
      name: 'python',
      extensions: ['ms-python.python', 'charliermarsh.ruff'],
    },
  ],
};

const exampleWithVscode: ExampleConfig = {
  title: 'VS Code with per-language extensions',
  description: 'Install VS Code with general extensions, then keep each language\'s extensions in its own list so they can be added or removed together.',
  configs: [
    {
      type: 'vscode',
      extensions: ['eamodio.gitlens', 'editorconfig.editorconfig'],
    },
    {
      type: 'vscode-extensions',
      name: 'javascript',
      extensions: ['dbaeumer.vscode-eslint', 'esbenp.prettier-vscode'],
    },
    {
      type: 'vscode-extensions',
      name: 'go',
      extensions: ['golang.go'],
    },
  ],
};

export class VscodeExtensionsResource extends Resource<VscodeExtensionsConfig> {
  getSettings(): ResourceSettings<VscodeExtensionsConfig> {
    return {
      id: 'vscode-extensions',
      defaultConfig,
      exampleConfigs: {
        example1: examplePython,
        example2: exampleWithVscode,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['vscode'],
      allowMultiple: true,
      // Destroying this resource uninstalls the extensions it lists (and only those).
      removeStatefulParametersBeforeDestroy: true,
      parameterSettings: {
        directory: { type: 'directory', default: '/Applications', setting: true },
        extensions: { stateful: new ExtensionsParameter(), order: 1 },
      },
    };
  }

  override async refresh(parameters: Partial<VscodeExtensionsConfig>): Promise<Partial<VscodeExtensionsConfig> | null> {
    // The resource exists as long as VS Code is installed. The extensions are refreshed by their stateful parameter.
    return (await this.isCodeAvailable(parameters.directory)) ? {} : null;
  }

  override async create(): Promise<void> {
    if (!(await this.isCodeAvailable())) {
      throw new Error('VS Code is not installed. Add a vscode resource to install it first.');
    }
  }

  override async destroy(): Promise<void> {
    // Nothing to do: the listed extensions are uninstalled by the stateful parameter. VS Code itself is left installed.
  }

  private async isCodeAvailable(directory?: string): Promise<boolean> {
    const code = getCodeBinary(directory);

    if (Utils.isMacOS()) {
      try {
        await fs.access(code);
        return true;
      } catch {
        return false;
      }
    }

    const $ = getPty();
    const { status } = await $.spawnSafe(`command -v ${code}`, { interactive: true });
    return status === SpawnStatus.SUCCESS;
  }
}
