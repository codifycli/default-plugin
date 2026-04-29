import {
  ExampleConfig,
  FileUtils,
  getPty,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  z
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { UvGlobalParameter } from './global-parameter.js';
import { UvPythonVersionsParameter } from './python-versions-parameter.js';
import { UvToolsParameter } from './tools-parameter.js';

const UV_LOCAL_BIN = path.join(os.homedir(), '.local', 'bin');
const UV_LOCAL_BIN_PATH_EXPORT = `export PATH="$HOME/.local/bin:$PATH"`;

const schema = z.object({
  pythonVersions: z
    .array(z.string())
    .describe('Python versions to install via uv (e.g. ["3.12", "3.11"])')
    .optional(),
  global: z
    .string()
    .describe('Python version to set as the global default (exposes `python` and `python3` on PATH via --default flag)')
    .optional(),
  tools: z
    .array(z.string())
    .describe('Global CLI tools to install via uv tool install (e.g. ["ruff", "black"])')
    .optional(),
})
  .meta({ $comment: 'https://codifycli.com/docs/resources/uv' })
  .describe('uv resource — fast Python package and project manager from Astral');

export type UvConfig = z.infer<typeof schema>;

const defaultConfig: Partial<UvConfig> = {
  pythonVersions: [],
  tools: [],
}

const examplePython: ExampleConfig = {
  title: 'Install uv with Python versions',
  description: 'Install uv, pin one or more Python versions, and set one as the global default accessible as `python` on PATH.',
  configs: [{
    type: 'uv',
    pythonVersions: ['3.12', '3.11'],
    global: '3.12',
  }]
}

const exampleWithTools: ExampleConfig = {
  title: 'Install uv with Python and global tools',
  description: 'Install uv, set a global default Python, and install commonly used global CLI tools like ruff and black.',
  configs: [{
    type: 'uv',
    pythonVersions: ['3.12'],
    global: '3.12',
    tools: ['ruff', 'black', 'httpie'],
  }]
}

export class UvResource extends Resource<UvConfig> {
  getSettings(): ResourceSettings<UvConfig> {
    return {
      id: 'uv',
      defaultConfig,
      exampleConfigs: {
        example1: examplePython,
        example2: exampleWithTools,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        pythonVersions: { type: 'stateful', definition: new UvPythonVersionsParameter(), order: 1 },
        global: { type: 'stateful', definition: new UvGlobalParameter(), order: 2 },
        tools: { type: 'stateful', definition: new UvToolsParameter(), order: 3 },
      },
      dependencies: [...(Utils.isMacOS() ? ['homebrew'] : [])],
    };
  }

  async refresh(): Promise<Partial<UvConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('uv --version');
    return status === SpawnStatus.SUCCESS ? {} : null;
  }

  async create(): Promise<void> {
    if (Utils.isMacOS()) {
      await installOnMacOS();
    } else {
      await installOnLinux();
    }
  }

  async destroy(): Promise<void> {
    if (Utils.isMacOS()) {
      await uninstallOnMacOS();
    } else {
      await uninstallOnLinux();
    }
  }
}

async function installOnMacOS(): Promise<void> {
  const $ = getPty();
  await $.spawn('brew install uv', { interactive: true, env: { HOMEBREW_NO_AUTO_UPDATE: '1' } });
}

async function uninstallOnMacOS(): Promise<void> {
  const $ = getPty();
  await $.spawn('brew uninstall uv', { interactive: true, env: { HOMEBREW_NO_AUTO_UPDATE: '1' } });
}

async function installOnLinux(): Promise<void> {
  const $ = getPty();

  const { status: curlStatus } = await $.spawnSafe('which curl');
  if (curlStatus === SpawnStatus.ERROR) {
    await Utils.installViaPkgMgr('curl');
  }

  await fs.mkdir(UV_LOCAL_BIN, { recursive: true });

  await $.spawn('curl -LsSf https://astral.sh/uv/install.sh | sh', {
    interactive: true,
    env: { UV_NO_MODIFY_PATH: '1' },
  });

  await FileUtils.addToShellRc(UV_LOCAL_BIN_PATH_EXPORT);
}

async function uninstallOnLinux(): Promise<void> {
  const uvBin = path.join(UV_LOCAL_BIN, 'uv');
  const uvxBin = path.join(UV_LOCAL_BIN, 'uvx');

  await fs.rm(uvBin, { force: true });
  await fs.rm(uvxBin, { force: true });

  const uvDataDir = path.join(os.homedir(), '.local', 'share', 'uv');
  await fs.rm(uvDataDir, { recursive: true, force: true });

  await FileUtils.removeLineFromShellRc(UV_LOCAL_BIN_PATH_EXPORT);
}
