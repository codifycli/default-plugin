import { CreatePlan, ExampleConfig, getPty, Resource, ResourceSettings, SpawnStatus, z } from '@codifycli/plugin-core';
import { LinuxDistro, OS, ResourceConfig, ResourceOs } from '@codifycli/schemas';

import { YumInstallParameter, YumPackage } from './install-parameter.js';

export const schema = z.object({
  install: z.array(z.union([z.string(), z.looseObject({
    name: z.string().describe('The package name.'),
    version: z.string().optional().describe('The version to install. Omit for the latest version.'),
  })])).optional().describe('Installs packages using yum.'),
  update: z.boolean().optional().describe('Whether to run yum check-update before installing packages. Defaults to true.'),
})
  .describe('Manage yum packages on Red Hat-based systems.');

export type YumConfig = z.infer<typeof schema>;

const defaultConfig: Partial<YumConfig & ResourceConfig> = {
  install: [],
  distro: [LinuxDistro.RPM_BASED],
  os: [ResourceOs.LINUX]
}

const exampleBasic: ExampleConfig = {
  title: 'Install common dev tools with yum',
  description: 'Install a set of frequently needed development packages on a CentOS/RHEL-based system.',
  configs: [{
    type: 'yum',
    install: ['git', 'curl', 'wget', 'vim', 'make'],
    distro: [LinuxDistro.RPM_BASED],
    os: [ResourceOs.LINUX]
  }]
}

const examplePinned: ExampleConfig = {
  title: 'Install packages at pinned versions',
  description: 'Install specific versions of packages to ensure a reproducible development environment across machines.',
  configs: [{
    type: 'yum',
    install: [
      { name: 'nodejs', version: '20.0.0' },
      { name: 'python3', version: '3.11.0' },
    ],
    distro: [LinuxDistro.RPM_BASED],
    os: [ResourceOs.LINUX]
  }]
}

export class YumResource extends Resource<YumConfig> {

  override getSettings(): ResourceSettings<YumConfig> {
    return {
      id: 'yum',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: examplePinned,
      },
      operatingSystems: [OS.Linux],
      schema,
      parameterSettings: {
        install: { stateful: new YumInstallParameter() },
        update: { type: 'boolean', default: true, setting: true }
      }
    };
  }

  override async refresh(parameters: Partial<YumConfig>): Promise<Partial<YumConfig> | null> {
    const $ = getPty();

    const yumCheck = await $.spawnSafe('which yum');
    if (yumCheck.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(_plan: CreatePlan<YumConfig>): Promise<void> {
    const $ = getPty();

    // Update package lists
    await $.spawn('yum check-update', { requiresRoot: true, interactive: true });

    console.log('yum is already installed on this Red Hat-based system');
  }

  override async destroy(): Promise<void> {
    // yum is a core system component and should not be removed
    throw new Error('yum cannot be destroyed as it is a core system package manager');
  }
}
