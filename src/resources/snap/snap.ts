import {
  CreatePlan,
  ExampleConfig,
  getPty,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils
} from '@codifycli/plugin-core';
import { OS, ResourceConfig, ResourceOs } from '@codifycli/schemas';

import { SnapInstallParameter, SnapPackage } from './install-parameter.js';
import schema from './snap-schema.json';

export interface SnapConfig extends ResourceConfig {
  install: Array<SnapPackage | string>;
}

const defaultConfig: Partial<SnapConfig> = {
  install: [],
  os: [ResourceOs.LINUX],
}

const exampleBasic: ExampleConfig = {
  title: 'Install common apps with snap',
  description: 'Install a set of popular applications via snap on an Ubuntu or other snap-enabled Linux system.',
  configs: [{
    type: 'snap',
    install: ['spotify', 'vlc', 'slack'],
    os: ['linux'],
  }]
}

const exampleClassic: ExampleConfig = {
  title: 'Install developer tools with classic snaps',
  description: 'Install developer tools that require classic confinement for full system access.',
  configs: [{
    type: 'snap',
    install: [
      { name: 'code', classic: true },
      { name: 'node', channel: '20/stable', classic: true },
    ],
    os: ['linux'],
  }]
}

export class SnapResource extends Resource<SnapConfig> {

  override getSettings(): ResourceSettings<SnapConfig> {
    return {
      id: 'snap',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleClassic,
      },
      operatingSystems: [OS.Linux],
      removeStatefulParametersBeforeDestroy: true,
      schema,
      parameterSettings: {
        install: { type: 'stateful', definition: new SnapInstallParameter() }
      }
    };
  }

  override async refresh(parameters: Partial<SnapConfig>): Promise<Partial<SnapConfig> | null> {
    const $ = getPty();

    const snapCheck = await $.spawnSafe('which snap');
    if (snapCheck.status === SpawnStatus.ERROR) {
      return null;
    }

    return parameters;
  }

  override async create(_plan: CreatePlan<SnapConfig>): Promise<void> {
    await Utils.installViaPkgMgr('snapd');
  }

  override async destroy(): Promise<void> {
    // snap is a core system component and should not be removed
    await Utils.uninstallViaPkgMgr('snapd');
  }
}
