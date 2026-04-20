import { CreatePlan, ExampleConfig, getPty, Resource, ResourceSettings, SpawnStatus } from '@codifycli/plugin-core';
import { LinuxDistro, OS, ResourceConfig, ResourceOs } from '@codifycli/schemas';

import schema from './dnf-schema.json';
import { DnfInstallParameter, DnfPackage } from './install-parameter.js';

export interface DnfConfig extends ResourceConfig {
  install: Array<DnfPackage | string>;
  update?: boolean;
}

const defaultConfig: Partial<DnfConfig> = {
  install: [],
  distro: [LinuxDistro.RPM_BASED],
  os: [ResourceOs.LINUX]
}

const exampleBasic: ExampleConfig = {
  title: 'Install common dev tools with dnf',
  description: 'Install a set of frequently needed development packages on a Fedora/RHEL-based system.',
  configs: [{
    type: 'dnf',
    install: ['git', 'curl', 'wget', 'vim', 'make'],
    distro: ['rpm-based'],
    os: ['linux'],
  }]
}

const examplePinned: ExampleConfig = {
  title: 'Install packages at pinned versions',
  description: 'Install specific versions of packages to ensure a reproducible development environment across machines.',
  configs: [{
    type: 'dnf',
    install: [
      { name: 'nodejs', version: '20.0.0' },
      { name: 'python3', version: '3.11.0' },
    ],
    distro: ['rpm-based'],
    os: ['linux'],
  }]
}

export class DnfResource extends Resource<DnfConfig> {

  override getSettings(): ResourceSettings<DnfConfig> {
    return {
      id: 'dnf',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: examplePinned,
      },
      operatingSystems: [OS.Linux],
      schema,
      parameterSettings: {
        install: { type: 'stateful', definition: new DnfInstallParameter() },
        update: { type: 'boolean', default: true, setting: true }
      }
    };
  }

  override async refresh(parameters: Partial<DnfConfig>): Promise<Partial<DnfConfig> | null> {
    const $ = getPty();

    const dnfCheck = await $.spawnSafe('which dnf');
    if (dnfCheck.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(_plan: CreatePlan<DnfConfig>): Promise<void> {
    const $ = getPty();

    // Update package lists
    await $.spawnSafe('dnf check-update', { requiresRoot: true, interactive: true });

    console.log('dnf is already installed on this Red Hat-based system');
  }

  override async destroy(): Promise<void> {
    // dnf is a core system component and should not be removed
    throw new Error('dnf cannot be destroyed as it is a core system package manager');
  }
}
