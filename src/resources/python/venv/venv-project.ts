import {
  CreatePlan,
  DestroyPlan,
  Resource,
  ResourceSettings,
  getPty
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from 'codify-schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import schema from './venv-project-schema.json';

export interface VenvProjectConfig extends ResourceConfig {
  envDir: string;
  systemSitePackages?: boolean;
  symlinks?: boolean;
  copies?: boolean;
  clear?: boolean;
  upgrade?: boolean;
  withoutPip?: boolean;
  prompt?: string;
  upgradeDeps?: boolean;
  cwd?: string;
  automaticallyInstallRequirementsTxt?: boolean;
}

export class VenvProject extends Resource<VenvProjectConfig> {

  getSettings(): ResourceSettings<VenvProjectConfig> {
    return {
      id: 'venv-project',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        envDir: { type: 'directory' },
        systemSitePackages: { type: 'boolean', setting: true },
        symlinks: { type: 'boolean', setting: true },
        copies: { type: 'boolean', setting: true },
        upgrade: { type: 'boolean', setting: true },
        withoutPip: { type: 'boolean', setting: true },
        prompt: { type: 'string', setting: true },
        upgradeDeps: { type: 'boolean', setting: true },
        cwd: { type: 'directory', setting: true },
        automaticallyInstallRequirementsTxt: { type: 'boolean', setting: true },
      },
      allowMultiple: {
        identifyingParameters: ['envDir'],
      },
      dependencies: ['homebrew', 'pyenv', 'git-repository']
    }
  }

  async refresh(parameters: Partial<VenvProjectConfig>): Promise<Partial<VenvProjectConfig> | Partial<VenvProjectConfig>[] | null> {
    const dir = parameters.cwd
      ? path.join(parameters.cwd, parameters.envDir!)
      : parameters.envDir!;

    if (!(await FileUtils.exists(dir))) {
      return null;
    }

    if (!(await FileUtils.exists(path.join(dir, 'pyvenv.cfg')))) {
      return null;
    }

    return parameters;
  }

  async create(plan: CreatePlan<VenvProjectConfig>): Promise<void> {
    const $ = getPty();
    const desired = plan.desiredConfig;

    const command = 'python -m venv ' +
      (desired.systemSitePackages ? `--system-site-packages=${desired.systemSitePackages} ` : '') +
      (desired.symlinks ? '--symlinks ' : '') +
      (desired.copies ? '--copies ' : '') +
      (desired.clear ? '--clear ' : '') +
      (desired.upgrade ? '--upgrade ' : '') +
      (desired.withoutPip ? '--withoutPip ' : '') +
      (desired.prompt ? `--prompt ${desired.prompt} ` : '') +
      (desired.upgradeDeps ? '--upgradeDeps ' : '') +
      desired.envDir;

    await $.spawn(command, { cwd: desired.cwd ?? undefined, interactive: true });

    if (desired.automaticallyInstallRequirementsTxt) {
      await $.spawn(`source ${desired.envDir}/bin/activate; pip install -r requirements.txt`, { cwd: desired.cwd, interactive: true });
    }
  }

  async destroy(plan: DestroyPlan<VenvProjectConfig>): Promise<void> {
    const current = plan.currentConfig;

    const dir = current.cwd
      ? path.join(current.cwd, current.envDir!)
      : current.envDir!;

    await fs.rm(dir, { recursive: true, force: true });
  }
}
