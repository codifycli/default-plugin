import { CreatePlan, ExampleConfig, getPty, Resource, ResourceSettings, SpawnStatus } from '@codifycli/plugin-core';
import { LinuxDistro, OS, ResourceConfig, ResourceOs } from '@codifycli/schemas';

import { YumInstallParameter, YumPackage } from './install-parameter.js';
import schema from './yum-schema.json';

export interface YumConfig extends ResourceConfig {
  install: Array<YumPackage | string>;
  update?: boolean;
}

const defaultConfig: Partial<YumConfig> = {
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
        install: { type: 'stateful', definition: new YumInstallParameter() },
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
