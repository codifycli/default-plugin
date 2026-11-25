import { describe, expect, it } from 'vitest';

import {
  buildCheckCommand,
  buildInstallCommand,
  buildNodeVersionSwitch,
  computeHash,
  detectPackageManagers,
  ProjectFiles,
  resolvePackageManagers,
  wrapCommand,
} from './package-managers.js';

function files(names: string[], extra: Partial<ProjectFiles> = {}): ProjectFiles {
  return { names: new Set(names), ...extra };
}

describe('detectPackageManagers', () => {
  it('detects each Node.js lockfile', () => {
    expect(detectPackageManagers(files(['package.json', 'package-lock.json']))).toEqual(['npm']);
    expect(detectPackageManagers(files(['package.json', 'pnpm-lock.yaml']))).toEqual(['pnpm']);
    expect(detectPackageManagers(files(['package.json', 'yarn.lock']))).toEqual(['yarn']);
    expect(detectPackageManagers(files(['package.json', 'bun.lock']))).toEqual(['bun']);
    expect(detectPackageManagers(files(['package.json', 'bun.lockb']))).toEqual(['bun']);
  });

  it('falls back to npm for a package.json without a lockfile', () => {
    expect(detectPackageManagers(files(['package.json']))).toEqual(['npm']);
  });

  it('prefers the corepack packageManager field over lockfiles', () => {
    expect(detectPackageManagers(files(['package.json', 'package-lock.json'], {
      packageJson: { packageManager: 'pnpm@9.12.0' },
    }))).toEqual(['pnpm']);
  });

  it('ignores an unknown packageManager field', () => {
    expect(detectPackageManagers(files(['package.json', 'yarn.lock'], {
      packageJson: { packageManager: 'unknown@1.0.0' },
    }))).toEqual(['yarn']);
  });

  it('picks only one manager per ecosystem', () => {
    expect(detectPackageManagers(files(['package.json', 'pnpm-lock.yaml', 'package-lock.json']))).toEqual(['pnpm']);
    expect(detectPackageManagers(files(['pyproject.toml', 'uv.lock', 'requirements.txt']))).toEqual(['uv']);
  });

  it('detects Python managers', () => {
    expect(detectPackageManagers(files(['pyproject.toml', 'uv.lock']))).toEqual(['uv']);
    expect(detectPackageManagers(files(['pyproject.toml', 'poetry.lock']))).toEqual(['poetry']);
    expect(detectPackageManagers(files(['Pipfile']))).toEqual(['pipenv']);
    expect(detectPackageManagers(files(['Pipfile', 'Pipfile.lock']))).toEqual(['pipenv']);
    expect(detectPackageManagers(files(['requirements.txt']))).toEqual(['pip']);
  });

  it('detects Python managers from pyproject.toml tool tables', () => {
    expect(detectPackageManagers(files(['pyproject.toml'], { pyprojectToml: '[tool.poetry]\nname = "x"' }))).toEqual(['poetry']);
    expect(detectPackageManagers(files(['pyproject.toml'], { pyprojectToml: '[project]\nname = "x"\n\n[tool.uv]\ndev-dependencies = []' }))).toEqual(['uv']);
    expect(detectPackageManagers(files(['pyproject.toml'], { pyprojectToml: '[project]\nname = "x"' }))).toEqual([]);
  });

  it('detects bundler and go', () => {
    expect(detectPackageManagers(files(['Gemfile', 'Gemfile.lock']))).toEqual(['bundler']);
    expect(detectPackageManagers(files(['go.mod', 'go.sum']))).toEqual(['go']);
  });

  it('detects every ecosystem in a polyglot project', () => {
    expect(detectPackageManagers(files(['package.json', 'pnpm-lock.yaml', 'pyproject.toml', 'uv.lock', 'Gemfile', 'go.mod'])))
      .toEqual(['pnpm', 'uv', 'bundler', 'go']);
  });

  it('detects nothing in an empty directory', () => {
    expect(detectPackageManagers(files(['README.md']))).toEqual([]);
  });
});

describe('resolvePackageManagers', () => {
  it('uses detection when no explicit list is given', () => {
    expect(resolvePackageManagers('/p', files(['package.json', 'yarn.lock']))).toEqual(['yarn']);
    expect(resolvePackageManagers('/p', files(['package.json', 'yarn.lock']), [])).toEqual(['yarn']);
  });

  it('uses the explicit list, de-duplicated', () => {
    expect(resolvePackageManagers('/p', files(['package.json', 'package-lock.json', 'requirements.txt']), ['npm', 'pip', 'npm'])).toEqual(['npm', 'pip']);
  });

  it('allows overriding the detected manager in the same ecosystem', () => {
    expect(resolvePackageManagers('/p', files(['package.json', 'package-lock.json']), ['pnpm'])).toEqual(['pnpm']);
  });

  it('throws when an explicit manager has no project files', () => {
    expect(() => resolvePackageManagers('/p', files(['package.json']), ['bundler'])).toThrow(/"bundler"/);
  });
});

describe('buildInstallCommand', () => {
  const ctx = (names: string[], options = {}, extra = {}) => ({ files: files(names), options, ...extra });

  it('uses npm ci only for a frozen install with a lockfile', () => {
    expect(buildInstallCommand('npm', ctx(['package.json', 'package-lock.json'], { frozenLockfile: true }))).toBe('npm ci');
    expect(buildInstallCommand('npm', ctx(['package.json'], { frozenLockfile: true }))).toBe('npm install');
    expect(buildInstallCommand('npm', ctx(['package.json', 'package-lock.json']))).toBe('npm install');
  });

  it('builds frozen flags for each manager', () => {
    const frozen = { frozenLockfile: true };
    expect(buildInstallCommand('pnpm', ctx([], frozen))).toBe('pnpm install --frozen-lockfile');
    expect(buildInstallCommand('yarn', ctx([], frozen, { yarnBerry: false }))).toBe('yarn install --frozen-lockfile');
    expect(buildInstallCommand('yarn', ctx([], frozen, { yarnBerry: true }))).toBe('yarn install --immutable');
    expect(buildInstallCommand('bun', ctx([], frozen))).toBe('bun install --frozen-lockfile');
    expect(buildInstallCommand('uv', ctx([], frozen))).toBe('uv sync --locked');
    expect(buildInstallCommand('poetry', ctx([], frozen))).toBe('poetry check --lock && poetry install');
    expect(buildInstallCommand('pipenv', ctx([], frozen))).toBe('pipenv install --deploy');
    expect(buildInstallCommand('bundler', ctx([], frozen))).toBe('BUNDLE_FROZEN=true bundle install');
    expect(buildInstallCommand('go', ctx([], frozen))).toBe('go mod download');
  });

  it('appends quoted extra args', () => {
    expect(buildInstallCommand('pnpm', ctx([], { args: ['--prefer-offline', "it's"] })))
      .toBe(`pnpm install '--prefer-offline' 'it'\\''s'`);
  });

  it('creates the virtualenv if needed and installs requirements.txt for pip', () => {
    expect(buildInstallCommand('pip', ctx(['requirements.txt'], {}, { pipVirtualEnv: '/p/.venv' })))
      .toBe(`{ [ -f '/p/.venv/pyvenv.cfg' ] || python3 -m venv '/p/.venv'; } && '/p/.venv/bin/python' -m pip install -r requirements.txt`);
  });

  it('installs the project itself for pip when there is no requirements.txt', () => {
    expect(buildInstallCommand('pip', ctx(['pyproject.toml'], {}, { pipVirtualEnv: '/p/.venv' })))
      .toMatch(/-m pip install \.$/);
  });
});

describe('buildCheckCommand', () => {
  it('only exists for managers with a native read-only check', () => {
    expect(buildCheckCommand('uv', {})).toBe('uv sync --check');
    expect(buildCheckCommand('uv', { frozenLockfile: true, args: ['--all-extras'] })).toBe(`uv sync --check --locked '--all-extras'`);
    expect(buildCheckCommand('bundler', {})).toBe('bundle check');
    expect(buildCheckCommand('go', {})).toBe('GOPROXY=off go mod download');
    expect(buildCheckCommand('npm', {})).toBeUndefined();
    expect(buildCheckCommand('pip', {})).toBeUndefined();
  });
});

describe('Node version switching', () => {
  it('does nothing without a version file', () => {
    expect(buildNodeVersionSwitch(files(['package.json']))).toBeUndefined();
  });

  it('uses fnm or nvm for .nvmrc', () => {
    const cmd = buildNodeVersionSwitch(files(['.nvmrc']))!;
    expect(cmd).toContain('fnm use');
    expect(cmd).toContain('nvm use');
  });

  it('only uses fnm for .node-version, since nvm does not read it', () => {
    const cmd = buildNodeVersionSwitch(files(['.node-version']))!;
    expect(cmd).toContain('fnm use');
    expect(cmd).not.toContain('nvm use');
  });

  it('is only added to Node.js commands', () => {
    const f = files(['.nvmrc']);
    expect(wrapCommand('npm install', '/p', 'npm', f)).toContain('fnm use');
    expect(wrapCommand('uv sync', '/p', 'uv', f)).toBe(`cd '/p' && uv sync`);
  });
});

describe('computeHash', () => {
  it('changes when the lockfile, the manager or the args change', () => {
    const base = computeHash('npm', [['package-lock.json', 'a']], {});
    expect(computeHash('npm', [['package-lock.json', 'a']], {})).toBe(base);
    expect(computeHash('npm', [['package-lock.json', 'b']], {})).not.toBe(base);
    expect(computeHash('pnpm', [['package-lock.json', 'a']], {})).not.toBe(base);
    expect(computeHash('npm', [['package-lock.json', 'a']], { args: ['--omit=dev'] })).not.toBe(base);
  });
});
