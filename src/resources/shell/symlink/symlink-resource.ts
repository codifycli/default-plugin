import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

export const schema = z.object({
  path: z.string().describe('The location of the symlink to create.'),
  target: z.string().describe('The file or directory the symlink should point to.'),
})
  .describe('Manages a single symbolic link, creating it at `path` and pointing it at `target`.');

export type SymlinkConfig = z.infer<typeof schema>;

const defaultConfig: Partial<SymlinkConfig> = {
  path: '<Replace me here!>',
  target: '<Replace me here!>',
}

const exampleDotfile: ExampleConfig = {
  title: 'Symlink a dotfile from a dotfiles repo',
  description: 'Point a config file at the copy tracked in a version-controlled dotfiles repository.',
  configs: [{
    type: 'symlink',
    path: '~/.vimrc',
    target: '~/dotfiles/vimrc',
  }]
}

const exampleDirectory: ExampleConfig = {
  title: 'Symlink an application into /Applications',
  description: 'Expose an application installed in a custom location under the standard /Applications directory.',
  configs: [{
    type: 'symlink',
    path: '/Applications/MyApp.app',
    target: '~/Applications/MyApp.app',
  }]
}

export class SymlinkResource extends Resource<SymlinkConfig> {
  getSettings(): ResourceSettings<SymlinkConfig> {
    return {
      id: 'symlink',
      defaultConfig,
      exampleConfigs: {
        example1: exampleDotfile,
        example2: exampleDirectory,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        path: { type: 'directory' },
        target: { type: 'directory', canModify: true },
      },
      importAndDestroy: {
        preventImport: true,
      },
      allowMultiple: {
        identifyingParameters: ['path'],
      },
    }
  }

  override async refresh(parameters: Partial<SymlinkConfig>): Promise<Partial<SymlinkConfig> | null> {
    const { path: linkPath } = parameters;
    if (!linkPath) {
      return null;
    }

    let stats;
    try {
      stats = await fs.lstat(linkPath);
    } catch {
      return null;
    }

    if (!stats.isSymbolicLink()) {
      throw new Error(`A file or directory already exists at ${linkPath} and is not a symlink. Please remove it manually and re-run Codify.`);
    }

    const target = await fs.readlink(linkPath);

    return {
      path: linkPath,
      target,
    }
  }

  override async create(plan: CreatePlan<SymlinkConfig>): Promise<void> {
    const { path: linkPath, target } = plan.desiredConfig;

    const parentDir = path.dirname(linkPath);
    await fs.mkdir(parentDir, { recursive: true });

    await fs.symlink(target, linkPath);
  }

  override async modify(pc: ParameterChange<SymlinkConfig>, plan: ModifyPlan<SymlinkConfig>): Promise<void> {
    if (pc.name !== 'target') {
      return;
    }

    const { path: linkPath } = plan.currentConfig;

    await fs.unlink(linkPath);
    await fs.symlink(plan.desiredConfig.target, linkPath);
  }

  override async destroy(plan: DestroyPlan<SymlinkConfig>): Promise<void> {
    const { path: linkPath } = plan.currentConfig;

    const stats = await fs.lstat(linkPath);
    if (!stats.isSymbolicLink()) {
      throw new Error(`Refusing to remove ${linkPath} because it is not a symlink. Please remove it manually and re-run Codify.`);
    }

    await fs.unlink(linkPath);
  }
}
