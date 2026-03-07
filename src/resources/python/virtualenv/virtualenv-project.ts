import {
  CreatePlan, DestroyPlan, ModifyPlan, ParameterChange, RefreshContext, Resource,
  ResourceSettings,
  getPty
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import schema from './virtualenv-project-schema.json';

export interface VirtualenvProjectConfig extends ResourceConfig {
  dest: string;
  python?: string;
  noVcsIgnore?: boolean;
  systemSitePackages?: boolean;
  symlinks?: boolean;
  cwd?: string;
  automaticallyInstallRequirementsTxt?: boolean;
}

// TODO: Remove path.resolve from cwd.
export class VirtualenvProject extends Resource<VirtualenvProjectConfig> {

  getSettings(): ResourceSettings<VirtualenvProjectConfig> {
    return {
      id: 'virtualenv-project',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        dest: { type: 'directory' },
        python: { type: 'string', setting: true },
        noVcsIgnore: { type: 'boolean', setting: true },
        systemSitePackages: { type: 'boolean', setting: true },
        symlinks: { type: 'boolean', setting: true },
        cwd: { type: 'directory', setting: true },
        automaticallyInstallRequirementsTxt: { type: 'boolean', setting: true },
      },
      allowMultiple: {
        identifyingParameters: ['dest'],
      },
      dependencies: ['virtualenv', 'homebrew', 'pyenv', 'git-repository']
    }
  }

  async refresh(parameters: Partial<VirtualenvProjectConfig>, context: RefreshContext<VirtualenvProjectConfig>): Promise<Partial<VirtualenvProjectConfig> | Partial<VirtualenvProjectConfig>[] | null> {
    const dir = parameters.cwd
      ? path.join(parameters.cwd, parameters.dest!)
      : parameters.dest!;

    if (!(await FileUtils.exists(dir))) {
      return null;
    }

    if (!(await FileUtils.exists(path.join(dir, 'pyvenv.cfg')))) {
      return null;
    }

    return parameters;
  }

  async create(plan: CreatePlan<VirtualenvProjectConfig>): Promise<void> {
    const $ = getPty();
    const desired = plan.desiredConfig;

    const command = 'virtualenv ' +
      (desired.python ? `-p ${desired.python} ` : '-p $(which python3) ') +
      (desired.noVcsIgnore ? `--no-vcs-ignore=${desired.noVcsIgnore} ` : '') +
      (desired.systemSitePackages ? `--system-site-packages=${desired.systemSitePackages} ` : '') +
      (desired.symlinks ? `--symlinks=${desired.symlinks} ` : '') +
      desired.dest;

    await $.spawn(command, { cwd: desired.cwd ?? undefined, interactive: true });

    if (desired.automaticallyInstallRequirementsTxt) {
      await $.spawn(`source ${desired.dest}/bin/activate; pip install -r requirements.txt`, { cwd: desired.cwd, interactive: true });
    }
  }

  async destroy(plan: DestroyPlan<VirtualenvProjectConfig>): Promise<void> {
    const current = plan.currentConfig;

    const dir = current.cwd
      ? path.join(current.cwd, current.dest!)
      : current.dest!;
    
    await fs.rm(dir, { recursive: true, force: true });
  }

}
