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

import { untildify } from '../../../utils/untildify.js';

interface SymlinkEntry {
  path: string;
  target: string;
}

export const schema = z.object({
  symlinks: z
    .array(z.object({
      path: z.string().describe('The location of the symlink.'),
      target: z.string().describe('The file or directory the symlink should point to.'),
    }))
    .describe('Symlinks to create')
    .optional(),
})
  .describe('Symlinks resource. Can be used to manage multiple symlinks.');

export type SymlinksConfig = z.infer<typeof schema>;

const defaultConfig: Partial<SymlinksConfig> = {
  symlinks: [],
}

const exampleDotfiles: ExampleConfig = {
  title: 'Symlink dotfiles from a dotfiles repo',
  description: 'Point several config files at the copies tracked in a version-controlled dotfiles repository.',
  configs: [{
    type: 'symlinks',
    symlinks: [
      { path: '~/.vimrc', target: '~/dotfiles/vimrc' },
      { path: '~/.zshrc', target: '~/dotfiles/zshrc' },
      { path: '~/.gitconfig', target: '~/dotfiles/gitconfig' },
    ],
  }]
}

const exampleAppsAndDirs: ExampleConfig = {
  title: 'Symlink config directories and applications',
  description: 'Expose a version-controlled config directory and an application installed in a custom location under their conventional paths.',
  configs: [{
    type: 'symlinks',
    symlinks: [
      { path: '~/.config/nvim', target: '~/dotfiles/nvim' },
      { path: '/Applications/MyApp.app', target: '~/Applications/MyApp.app' },
    ],
  }]
}

export class SymlinksResource extends Resource<SymlinksConfig> {
  getSettings(): ResourceSettings<SymlinksConfig> {
    return {
      id: 'symlinks',
      defaultConfig,
      exampleConfigs: {
        example1: exampleDotfiles,
        example2: exampleAppsAndDirs,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        symlinks: {
          type: 'array',
          itemType: 'object',
          canModify: true,
          isElementEqual: (a: SymlinkEntry, b: SymlinkEntry) =>
            this.resolve(a.path) === this.resolve(b.path) && this.resolve(a.target) === this.resolve(b.target),
          filterInStatelessMode: (desired: SymlinkEntry[], current: SymlinkEntry[]) =>
            current.filter((c) => desired.some((d) => this.resolve(d.path) === this.resolve(c.path))),
        },
      },
      importAndDestroy: {
        refreshMapper(input) {
          if (!input?.symlinks || input.symlinks.length === 0) {
            return { symlinks: [] };
          }

          return input;
        }
      }
    }
  }

  override async refresh(parameters: Partial<SymlinksConfig>): Promise<Partial<SymlinksConfig> | null> {
    const result: SymlinkEntry[] = [];

    for (const { path: linkPath } of parameters.symlinks ?? []) {
      const resolvedPath = this.resolve(linkPath);

      let stats;
      try {
        stats = await fs.lstat(resolvedPath);
      } catch {
        continue;
      }

      if (!stats.isSymbolicLink()) {
        throw new Error(`A file or directory already exists at ${linkPath} and is not a symlink. Please remove it manually and re-run Codify.`);
      }

      const target = await fs.readlink(resolvedPath);
      result.push({ path: linkPath, target });
    }

    if (result.length === 0) {
      return null;
    }

    return { symlinks: result };
  }

  override async create(plan: CreatePlan<SymlinksConfig>): Promise<void> {
    await this.addSymlinks(plan.desiredConfig.symlinks ?? []);
  }

  override async modify(pc: ParameterChange<SymlinksConfig>, plan: ModifyPlan<SymlinksConfig>): Promise<void> {
    if (pc.name !== 'symlinks') {
      return;
    }

    const previous = (pc.previousValue as SymlinkEntry[]) ?? [];
    const next = (pc.newValue as SymlinkEntry[]) ?? [];

    const toRemove = previous.filter((p) => !next.some((n) => this.resolve(n.path) === this.resolve(p.path)));
    const toAdd = next.filter((n) => {
      const prev = previous.find((p) => this.resolve(p.path) === this.resolve(n.path));
      return !prev || this.resolve(prev.target) !== this.resolve(n.target);
    });

    await this.removeSymlinks(toRemove);
    await this.addSymlinks(toAdd);
  }

  override async destroy(plan: DestroyPlan<SymlinksConfig>): Promise<void> {
    await this.removeSymlinks(plan.currentConfig.symlinks ?? []);
  }

  private async addSymlinks(entries: SymlinkEntry[]): Promise<void> {
    for (const { path: linkPath, target } of entries) {
      const resolvedPath = this.resolve(linkPath);
      const resolvedTarget = this.resolve(target);

      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });

      if (await this.isSymlink(resolvedPath)) {
        await fs.unlink(resolvedPath);
      }

      await fs.symlink(resolvedTarget, resolvedPath);
    }
  }

  private async removeSymlinks(entries: SymlinkEntry[]): Promise<void> {
    for (const { path: linkPath } of entries) {
      const resolvedPath = this.resolve(linkPath);

      if (!(await this.isSymlink(resolvedPath))) {
        throw new Error(`Refusing to remove ${linkPath} because it is not a symlink. Please remove it manually and re-run Codify.`);
      }

      await fs.unlink(resolvedPath);
    }
  }

  private async isSymlink(resolvedPath: string): Promise<boolean> {
    try {
      return (await fs.lstat(resolvedPath)).isSymbolicLink();
    } catch {
      return false;
    }
  }

  private resolve(linkPath: string): string {
    return untildify(linkPath);
  }
}
