import { Utils } from '@codifycli/plugin-core';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requiresOnMacOS } from './requires.js';

const RESOURCES_DIR = path.resolve(import.meta.dirname, '../resources');

// Resources that use brew without needing it: they only use it when it's already installed, or only to remove an
// install made by brew.
const BREW_EXCEPTIONS = new Set([
  'aws-cli/cli/aws-cli.ts', // brew only when it's already installed, else the .pkg installer
  'tart/tart.ts', // brew only to remove a previous brew install
  'terraform/terraform.ts', // brew only to remove a previous brew install
  'homebrew/homebrew.ts', // is homebrew
]);

function resourceFiles(dir = RESOURCES_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'completions' ? [] : resourceFiles(full);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [full] : [];
  });
}

/** Resource files with their source, plus the helpers they use (stateful parameters in the same folder, jetbrains/common) */
function resources(): Array<{ file: string; source: string; requires: string[] }> {
  return resourceFiles()
    .map((full) => ({ full, source: fs.readFileSync(full, 'utf8') }))
    .filter(({ source }) => /extends Resource</.test(source))
    .map(({ full, source }) => {
      const folderSources = fs.readdirSync(path.dirname(full))
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
        .map((f) => fs.readFileSync(path.join(path.dirname(full), f), 'utf8'))
        // Helpers of the folder (parameters, utils), not the other resources in it
        .filter((s) => s === source || !/extends Resource</.test(s));
      const common = source.includes('JetBrainsCommon')
        ? [fs.readFileSync(path.join(RESOURCES_DIR, 'jetbrains/common/jetbrains-common.ts'), 'utf8')]
        : [];
      const requires = [...source.matchAll(/requiresOnMacOS\(([^)]*)\)/g)]
        .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((t) => t[1]));

      return { file: path.relative(RESOURCES_DIR, full), source: [...folderSources, ...common].join('\n'), requires };
    });
}

describe('requiresOnMacOS', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the types on macOS and nothing elsewhere', () => {
    vi.spyOn(Utils, 'isMacOS').mockReturnValue(true);
    expect(requiresOnMacOS('homebrew', 'xcode-tools')).toEqual(['homebrew', 'xcode-tools']);

    vi.spyOn(Utils, 'isMacOS').mockReturnValue(false);
    expect(requiresOnMacOS('homebrew')).toEqual([]);
  });

  it('finds the resources', () => {
    expect(resources().length).toBeGreaterThan(50);
  });

  it.each(resources().filter((r) => !BREW_EXCEPTIONS.has(r.file)).map((r) => [r.file, r] as const))(
    '%s requires homebrew on macOS if it installs with brew',
    (_, { source, requires }) => {
      const usesBrew = /PackageManager\.BREW/.test(source) || /spawn(Safe)?\(\s*[`'"]brew /.test(source);
      if (usesBrew) {
        expect(requires).toContain('homebrew');
      }
    },
  );

  it.each(resources().map((r) => [r.file, r] as const))(
    '%s requires xcode-tools (or homebrew, which requires it) on macOS if it runs git',
    (_, { source, requires }) => {
      if (/spawn(Safe)?\(\s*[`'"]git /.test(source)) {
        expect(requires.some((t) => t === 'xcode-tools' || t === 'homebrew')).toBe(true);
      }
    },
  );
});
