import { CreatePlan, ExampleConfig, Resource, ResourceSettings, SpawnStatus, getPty, z } from '@codifycli/plugin-core';
import { LinuxDistro, OS, ResourceConfig, ResourceOs } from '@codifycli/schemas';

import { AptInstallParameter } from './install-parameter.js';

export const schema = z.object({
  install: z.array(z.string()).optional().describe('Installs packages using apt. Use \'name=version\' syntax to pin a version (e.g. \'nodejs=20.*\').'),
  update: z.boolean().optional().describe('Whether to run apt-get update before installing packages. Defaults to true.'),
})
  .describe('Installs packages with apt on Debian and Ubuntu Linux.');

export type AptConfig = z.infer<typeof schema>;

const defaultConfig: Partial<AptConfig & ResourceConfig> = {
  install: [],
  distro: [LinuxDistro.DEBIAN_BASED],
  os: [ResourceOs.LINUX]
}

const exampleBasic: ExampleConfig = {
  title: 'Install apt packages',
  description: 'Install a set of common development packages using apt on a Debian-based system.',
  configs: [{
    type: 'apt',
    os: [ResourceOs.LINUX],
    distro: [LinuxDistro.DEBIAN_BASED],
    install: ['curl', 'git', 'build-essential'],
  }]
}

const exampleVersionPinned: ExampleConfig = {
  title: 'Install apt packages with pinned versions',
  description: 'Install packages using apt, with specific versions pinned for reproducibility.',
  configs: [{
    type: 'apt',
    distro: [LinuxDistro.DEBIAN_BASED],
    os: [ResourceOs.LINUX],
    install: [
      'curl',
      'nodejs=20.*',
      'python3=3.12.*',
    ],
  }]
}

export class AptResource extends Resource<AptConfig> {

  override getSettings(): ResourceSettings<AptConfig> {
    return {
      id: 'apt',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleVersionPinned,
      },
      operatingSystems: [OS.Linux],
      schema,
      removeStatefulParametersBeforeDestroy: true,
      parameterSettings: {
        install: { stateful: new AptInstallParameter() },
        update: { type: 'boolean', default: true, setting: true }
      }
    };
  }

  override async refresh(parameters: Partial<AptConfig>): Promise<Partial<AptConfig> | null> {
    const $ = getPty();

    const aptCheck = await $.spawnSafe('which apt-get');
    if (aptCheck.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(_plan: CreatePlan<AptConfig>): Promise<void> {
    const $ = getPty();

    // Update package lists
    await $.spawn('apt-get update', { requiresRoot: true, interactive: true });

    console.log('apt is already installed on this Debian-based system');
  }

  override async destroy(): Promise<void> {
    // apt is a core system component and should not be removed
    console.warn('apt cannot be destroyed as it is a core system package manager');
  }
}
