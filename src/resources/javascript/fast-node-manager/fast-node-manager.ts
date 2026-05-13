import { ExampleConfig, FileUtils, getPty, Resource, ResourceSettings, SpawnStatus, Utils, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import os from 'node:os';
import path from 'node:path';

import { FnmDefaultVersionParameter } from './default-version-parameter.js';
import { FnmNodeVersionsParameter } from './node-versions-parameter.js';

const FNM_DIR = path.join(os.homedir(), '.fnm');
const FNM_PATH_EXPORT = 'export PATH="$HOME/.fnm:$PATH"';
const FNM_EVAL = 'eval "$(fnm env --use-on-cd)"';

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
    type: 'fast-node-manager',
    nodeVersions: ['lts'],
    defaultVersion: 'lts',
  }],
};

const exampleMultiVersion: ExampleConfig = {
  title: 'Install multiple Node.js versions via fnm',
  description: 'Install fnm with multiple Node.js versions side by side, using Node.js 22 as the global default.',
  configs: [{
    type: 'fast-node-manager',
    nodeVersions: ['18', '20', '22'],
    defaultVersion: '22',
  }],
};

export class FnmResource extends Resource<FnmConfig> {
  getSettings(): ResourceSettings<FnmConfig> {
    return {
      id: 'fast-node-manager',
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
    if (Utils.isMacOS()) {
      await installOnMacOS();
    } else {
      await installOnLinux();
    }
  }

  override async destroy(): Promise<void> {
    if (Utils.isMacOS()) {
      await uninstallOnMacOS();
    } else {
      await uninstallOnLinux();
    }
  }
}

async function installOnMacOS(): Promise<void> {
  await Utils.installViaPkgMgr('fnm');
  await FileUtils.addToShellRc(FNM_EVAL);
}

async function installOnLinux(): Promise<void> {
  const $ = getPty();
  await $.spawn('curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell', { interactive: true });
  await FileUtils.addAllToShellRc([FNM_PATH_EXPORT, FNM_EVAL]);
}

async function uninstallOnMacOS(): Promise<void> {
  await Utils.uninstallViaPkgMgr('fnm');
  await FileUtils.removeLineFromShellRc(FNM_EVAL);
}

async function uninstallOnLinux(): Promise<void> {
  const $ = getPty();
  await $.spawnSafe(`rm -rf ${FNM_DIR}`);
  await FileUtils.removeLineFromShellRc(FNM_PATH_EXPORT);
  await FileUtils.removeLineFromShellRc(FNM_EVAL);
}
