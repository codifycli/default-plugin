import { ExampleConfig, Resource, ResourceSettings, getPty, z } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas'

import { NpmInstallParameter } from './global-install.js';

export const schema = z.object({
  globalInstall: z.array(z.string().describe('Package name, optionally with a version specifier (e.g. "typescript" or "typescript@5.4.0")')).optional().describe('An array of npm packages to install globally. Use the npm@version syntax to pin a specific version (e.g. "nodemon@3.1.10").'),
})
  .describe('Install and manage packages using NPM.');

export type NpmConfig = z.infer<typeof schema>;

const defaultConfig: Partial<NpmConfig> = {
  globalInstall: [],
}

const exampleGlobalTools: ExampleConfig = {
  title: 'Install global npm packages',
  description: 'Install commonly used global CLI tools via npm, pinning specific versions where stability matters.',
  configs: [{
    type: 'npm',
    globalInstall: ['typescript@5.4.0', 'ts-node', 'nodemon', 'prettier'],
  }]
}

const exampleWithNvm: ExampleConfig = {
  title: 'Node.js via nvm with global npm packages',
  description: 'Install nvm, set a Node.js version as global, then install global npm packages on top.',
  configs: [
    {
      type: 'nvm',
      nodeVersions: ['lts'],
      global: 'lts',
    },
    {
      type: 'npm',
      globalInstall: ['typescript', 'ts-node', 'prettier'],
    }
  ]
}

export class Npm extends Resource<NpmConfig> {
  getSettings(): ResourceSettings<NpmConfig> {
    return {
      id: 'npm',
      defaultConfig,
      exampleConfigs: {
        example1: exampleGlobalTools,
        example2: exampleWithNvm,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        globalInstall: { stateful: new NpmInstallParameter() },
      },
      importAndDestroy: {
        preventDestroy: true,
      },
      dependencies: ['nvm', 'pnpm']
    }
  }

  async refresh(parameters: Partial<NpmConfig>): Promise<Partial<NpmConfig> | Partial<NpmConfig>[] | null> {
    const pty = getPty();

    const { status } = await pty.spawnSafe('which npm')
    if (status === 'error') {
      return null;
    }

    return parameters;
  }

  // Npm gets created with NodeJS
  async create(): Promise<void> {}

  // Npm is destroyed with NodeJS
  async destroy(): Promise<void> {}

}
