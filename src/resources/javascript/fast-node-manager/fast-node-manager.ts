import { ExampleConfig, FileUtils, getPty, Resource, ResourceSettings, SpawnStatus, Utils, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import os from 'node:os';
import path from 'node:path';

import { FnmDefaultVersionParameter } from './default-version-parameter.js';
import { FnmNodeVersionsParameter } from './node-versions-parameter.js';

const FNM_DIR = path.join(os.homedir(), '.fnm');
const FNM_MULTISHELL_EXPORT = 'export FNM_MULTISHELL_PATH="${TMPDIR:-/tmp}/fnm_multishells"';

const schema = z.object({
  nodeVersions: z
    .array(z.string())
    .describe('Node.js versions to install via fnm (e.g. ["20", "18.20.0", "lts"])')
    .optional(),
  defaultVersion: z
    .string()
    .describe('The default (global) Node.js version set by fnm.')
    .optional(),
})
  .describe('fast-node-manager resource — install and manage multiple Node.js versions via fnm');

export type FnmConfig = z.infer<typeof schema>;

const defaultConfig: Partial<FnmConfig> = {
  nodeVersions: [],
};

const exampleLts: ExampleConfig = {
  title: 'Install Node.js LTS via fnm',
  description: 'Install fnm and set the latest LTS release as the global Node.js version.',
  configs: [{
    type: 'fnm',
    nodeVersions: ['lts'],
    defaultVersion: 'lts',
  }],
};

const exampleMultiVersion: ExampleConfig = {
  title: 'Install multiple Node.js versions via fnm',
  description: 'Install fnm with multiple Node.js versions side by side, using Node.js 22 as the global default.',
  configs: [{
    type: 'fnm',
    nodeVersions: ['18', '20', '22'],
    defaultVersion: '22',
  }],
};

export class FnmResource extends Resource<FnmConfig> {
  getSettings(): ResourceSettings<FnmConfig> {
    return {
      id: 'fnm',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: exampleLts,
        example2: exampleMultiVersion,
      },
      parameterSettings: {
        nodeVersions: { type: 'stateful', definition: new FnmNodeVersionsParameter(), order: 1 },
        defaultVersion: { type: 'stateful', definition: new FnmDefaultVersionParameter(), order: 2 },
      },
    };
  }

  override async refresh(): Promise<Partial<FnmConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('fnm --version', { interactive: true });
    return status === SpawnStatus.SUCCESS ? {} : null;
  }

  override async create(): Promise<void> {
    await install();
  }

  override async destroy(): Promise<void> {
    await uninstall();
  }
}

async function install(): Promise<void> {
  if (Utils.isLinux()) {
    await Utils.installViaPkgMgr('curl unzip');
  }

  const $ = getPty();
  await $.spawn('curl -fsSL https://fnm.vercel.app/install | bash', { interactive: true });
  await FileUtils.addToShellRc(FNM_MULTISHELL_EXPORT);
}

async function uninstall(): Promise<void> {
  const $ = getPty();

  const { status: brewStatus } = await $.spawnSafe('brew list fnm', {
    env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
  });

  if (brewStatus === SpawnStatus.SUCCESS) {
    await Utils.uninstallViaPkgMgr('fnm');
  } else {
    await $.spawnSafe(`rm -rf ${FNM_DIR}`);
  }

  // Remove the block the installer appends to the shell rc file
  for (const line of [
    '# fnm',
    `FNM_PATH="${FNM_DIR}"`,
    'if [ -d "$FNM_PATH" ]; then',
    '  export PATH="$FNM_PATH:$PATH"',
    '  eval "$(fnm env --shell zsh)"',
    '  eval "$(fnm env --shell bash)"',
    'fi',
    FNM_MULTISHELL_EXPORT,
  ]) {
    await FileUtils.removeLineFromShellRc(line);
  }
}
