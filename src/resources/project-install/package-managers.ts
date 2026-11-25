import { getPty, SpawnStatus } from '@codifycli/plugin-core';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { escapeSingleQuoted } from '../../utils/shell-escape.js';

export const PACKAGE_MANAGER_IDS = ['npm', 'pnpm', 'yarn', 'bun', 'uv', 'poetry', 'pipenv', 'pip', 'bundler', 'go'] as const;
export type PackageManagerId = typeof PACKAGE_MANAGER_IDS[number];

type Ecosystem = 'go' | 'node' | 'python' | 'ruby';

export interface InstallOptions {
  args?: string[];
  env?: Record<string, string>;
  frozenLockfile?: boolean;
  packageManagers?: PackageManagerId[];
  virtualEnv?: string;
}

/** The top-level file names of a project directory plus the few file contents detection needs. */
export interface ProjectFiles {
  names: Set<string>;
  packageJson?: Record<string, unknown>;
  pyprojectToml?: string;
}

interface ManagerContext {
  directory: string;
  files: ProjectFiles;
  options: InstallOptions;
  /** Resolved virtualenv for pip (absolute). */
  pipVirtualEnv?: string;
  yarnBerry?: boolean;
}

interface PackageManagerDefinition {
  binary: string;
  ecosystem: Ecosystem;
  /** Files hashed into the install marker. Missing files are skipped. Undefined = the manager has a native in-sync check. */
  hashedFiles?: string[];
  /** Which resource (or action) the user should add when the binary is missing. */
  installHint: string;
  /** Whether the directory contains what this manager needs to run an install. */
  isUsable(files: ProjectFiles): boolean;
}

export const PACKAGE_MANAGERS: Record<PackageManagerId, PackageManagerDefinition> = {
  npm: {
    binary: 'npm',
    ecosystem: 'node',
    hashedFiles: ['package.json', 'package-lock.json', 'npm-shrinkwrap.json'],
    installHint: 'Add an "nvm", "fnm" or "asdf" resource to install Node.js and npm.',
    isUsable: (f) => f.names.has('package.json'),
  },
  pnpm: {
    binary: 'pnpm',
    ecosystem: 'node',
    hashedFiles: ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'],
    installHint: 'Add a "pnpm" resource to install pnpm.',
    isUsable: (f) => f.names.has('package.json'),
  },
  yarn: {
    binary: 'yarn',
    ecosystem: 'node',
    hashedFiles: ['package.json', 'yarn.lock', '.yarnrc.yml'],
    installHint: 'Install yarn first, for example with an "npm" resource (globalInstall: ["yarn"]) or by running "corepack enable".',
    isUsable: (f) => f.names.has('package.json'),
  },
  bun: {
    binary: 'bun',
    ecosystem: 'node',
    hashedFiles: ['package.json', 'bun.lock', 'bun.lockb'],
    installHint: 'Install bun first, for example with an "asdf" resource or an "action" resource.',
    isUsable: (f) => f.names.has('package.json'),
  },
  uv: {
    binary: 'uv',
    ecosystem: 'python',
    installHint: 'Add a "uv" resource to install uv.',
    isUsable: (f) => f.names.has('pyproject.toml'),
  },
  poetry: {
    binary: 'poetry',
    ecosystem: 'python',
    hashedFiles: ['pyproject.toml', 'poetry.lock'],
    installHint: 'Install poetry first, for example with a "uv" resource (tools: ["poetry"]) or a "pip" resource.',
    isUsable: (f) => f.names.has('pyproject.toml'),
  },
  pipenv: {
    binary: 'pipenv',
    ecosystem: 'python',
    hashedFiles: ['Pipfile', 'Pipfile.lock'],
    installHint: 'Install pipenv first, for example with a "uv" resource (tools: ["pipenv"]) or a "pip" resource.',
    isUsable: (f) => f.names.has('Pipfile'),
  },
  pip: {
    binary: 'python3',
    ecosystem: 'python',
    hashedFiles: ['requirements.txt', 'pyproject.toml', 'setup.py', 'setup.cfg'],
    installHint: 'Add a "pyenv" or "uv" resource to install Python.',
    isUsable: (f) => f.names.has('requirements.txt') || f.names.has('pyproject.toml') || f.names.has('setup.py'),
  },
  bundler: {
    binary: 'bundle',
    ecosystem: 'ruby',
    installHint: 'Add an "rbenv" resource to install Ruby and bundler.',
    isUsable: (f) => f.names.has('Gemfile'),
  },
  go: {
    binary: 'go',
    ecosystem: 'go',
    installHint: 'Add a "goenv" or "asdf" resource to install Go.',
    isUsable: (f) => f.names.has('go.mod'),
  },
};

const MARKER_FILE = '.codify-project-install.json';
const VIRTUAL_ENV_CANDIDATES = ['.venv', 'venv', 'env'];
const NODE_LOCKFILE_PRIORITY: Array<[string, PackageManagerId]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
];

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/**
 * Detects at most one package manager per ecosystem. Two managers from the same ecosystem would fight over the same
 * install directory (e.g. npm and pnpm both writing node_modules), so a single winner is chosen per ecosystem.
 */
export function detectPackageManagers(files: ProjectFiles): PackageManagerId[] {
  const detected: PackageManagerId[] = [];

  const node = detectNodeManager(files);
  if (node) detected.push(node);

  const python = detectPythonManager(files);
  if (python) detected.push(python);

  if (files.names.has('Gemfile')) detected.push('bundler');
  if (files.names.has('go.mod')) detected.push('go');

  return detected;
}

function detectNodeManager(files: ProjectFiles): PackageManagerId | undefined {
  if (!files.names.has('package.json')) {
    return undefined;
  }

  // The corepack "packageManager" field (e.g. "pnpm@9.1.0") is the project's explicit choice.
  const declared = files.packageJson?.packageManager;
  if (typeof declared === 'string') {
    const name = declared.split('@')[0] as PackageManagerId;
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(name)) {
      return name;
    }
  }

  for (const [lockfile, manager] of NODE_LOCKFILE_PRIORITY) {
    if (files.names.has(lockfile)) {
      return manager;
    }
  }

  return 'npm';
}

function detectPythonManager(files: ProjectFiles): PackageManagerId | undefined {
  if (files.names.has('uv.lock')) return 'uv';
  if (files.names.has('poetry.lock')) return 'poetry';
  if (files.names.has('Pipfile.lock') || files.names.has('Pipfile')) return 'pipenv';
  if (files.names.has('requirements.txt')) return 'pip';

  const pyproject = files.pyprojectToml ?? '';
  if (/^\[tool\.poetry]/m.test(pyproject)) return 'poetry';
  if (/^\[tool\.uv]/m.test(pyproject)) return 'uv';

  return undefined;
}

/**
 * Resolves which managers to run: the explicit list if given (validated against the directory), otherwise detection.
 */
export function resolvePackageManagers(directory: string, files: ProjectFiles, explicit?: PackageManagerId[]): PackageManagerId[] {
  if (!explicit || explicit.length === 0) {
    return detectPackageManagers(files);
  }

  const unusable = explicit.filter((m) => !PACKAGE_MANAGERS[m].isUsable(files));
  if (unusable.length > 0) {
    throw new Error(`project-install: ${unusable.map((m) => `"${m}"`).join(', ')} was requested for ${directory} but the required project files (e.g. package.json, pyproject.toml, requirements.txt, Gemfile, go.mod) were not found.`);
  }

  return [...new Set(explicit)];
}

export function quote(value: string): string {
  return `'${escapeSingleQuoted(value)}'`;
}

function joinArgs(args?: string[]): string {
  return args && args.length > 0 ? ' ' + args.map((a) => quote(a)).join(' ') : '';
}

/** Builds the install command for a manager. Runs from inside the project directory. */
export function buildInstallCommand(manager: PackageManagerId, ctx: Pick<ManagerContext, 'files' | 'options' | 'pipVirtualEnv' | 'yarnBerry'>): string {
  const { frozenLockfile, args } = ctx.options;
  const extra = joinArgs(args);

  switch (manager) {
    case 'npm': {
      const hasLockfile = ctx.files.names.has('package-lock.json') || ctx.files.names.has('npm-shrinkwrap.json');
      return (frozenLockfile && hasLockfile ? 'npm ci' : 'npm install') + extra;
    }

    case 'pnpm': {
      return 'pnpm install' + (frozenLockfile ? ' --frozen-lockfile' : '') + extra;
    }

    case 'yarn': {
      if (!frozenLockfile) {
        return 'yarn install' + extra;
      }

      return 'yarn install' + (ctx.yarnBerry ? ' --immutable' : ' --frozen-lockfile') + extra;
    }

    case 'bun': {
      return 'bun install' + (frozenLockfile ? ' --frozen-lockfile' : '') + extra;
    }

    case 'uv': {
      return 'uv sync' + (frozenLockfile ? ' --locked' : '') + extra;
    }

    case 'poetry': {
      return (frozenLockfile ? 'poetry check --lock && ' : '') + 'poetry install' + extra;
    }

    case 'pipenv': {
      return 'pipenv install' + (frozenLockfile ? ' --deploy' : '') + extra;
    }

    case 'pip': {
      const venv = ctx.pipVirtualEnv!;
      const python = quote(path.join(venv, 'bin', 'python'));
      const createVenv = `{ [ -f ${quote(path.join(venv, 'pyvenv.cfg'))} ] || python3 -m venv ${quote(venv)}; }`;
      const target = ctx.files.names.has('requirements.txt') ? '-r requirements.txt' : '.';
      return `${createVenv} && ${python} -m pip install ${target}${extra}`;
    }

    case 'bundler': {
      return (frozenLockfile ? 'BUNDLE_FROZEN=true ' : '') + 'bundle install' + extra;
    }

    case 'go': {
      return 'go mod download' + extra;
    }
  }
}

/**
 * Native "already in sync?" commands for managers that have a reliable, read-only check. Exit code 0 = in sync.
 * Managers without one use the lockfile-hash marker instead (see {@link PackageManagerDefinition.hashedFiles}).
 */
export function buildCheckCommand(manager: PackageManagerId, options: InstallOptions): string | undefined {
  switch (manager) {
    case 'uv': {
      return 'uv sync --check' + (options.frozenLockfile ? ' --locked' : '') + joinArgs(options.args);
    }

    case 'bundler': {
      return 'bundle check';
    }

    case 'go': {
      // Succeeds only if every module is already in the local module cache.
      return 'GOPROXY=off go mod download';
    }

    default: {
      return undefined;
    }
  }
}

/** Node version switching for .nvmrc / .node-version. Only uses fnm or nvm if they are already installed. */
export function buildNodeVersionSwitch(files: ProjectFiles): string | undefined {
  const hasNvmrc = files.names.has('.nvmrc');
  const hasNodeVersion = files.names.has('.node-version');
  if (!hasNvmrc && !hasNodeVersion) {
    return undefined;
  }

  const nvmBranch = hasNvmrc ? '; elif type nvm >/dev/null 2>&1; then nvm use >/dev/null' : '';
  return `if command -v fnm >/dev/null 2>&1; then eval "$(fnm env)" >/dev/null 2>&1; fnm use --silent-if-unchanged${nvmBranch}; fi`;
}

/**
 * Wraps a command so it runs inside the project directory with the right Node version. Env vars are deliberately not
 * inlined here (they may hold registry tokens and commands are logged); they are passed through the spawn options.
 */
export function wrapCommand(command: string, directory: string, manager: PackageManagerId, files: ProjectFiles): string {
  const parts = [`cd ${quote(directory)}`];

  if (PACKAGE_MANAGERS[manager].ecosystem === 'node') {
    const nodeSwitch = buildNodeVersionSwitch(files);
    if (nodeSwitch) parts.push(nodeSwitch);
  }

  parts.push(command);
  return parts.join(' && ');
}

export function computeHash(manager: PackageManagerId, contents: Array<[string, string]>, options: InstallOptions): string {
  const hash = createHash('sha256');
  hash.update(manager);
  hash.update(JSON.stringify(options.args ?? []));
  for (const [name, content] of contents) {
    hash.update(`\0${name}\0${content}`);
  }

  return hash.digest('hex');
}

// ---------------------------------------------------------------------------
// File system / shell helpers
// ---------------------------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readProjectFiles(directory: string): Promise<ProjectFiles | null> {
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch {
    return null;
  }

  const files: ProjectFiles = { names: new Set(names) };

  if (files.names.has('package.json')) {
    try {
      files.packageJson = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
    } catch {
      // Invalid package.json: let the package manager report the error at install time.
    }
  }

  if (files.names.has('pyproject.toml')) {
    files.pyprojectToml = await fs.readFile(path.join(directory, 'pyproject.toml'), 'utf8').catch(() => undefined);
  }

  return files;
}

/** Uses an existing virtualenv (.venv, venv or env) if present, otherwise the configured one (default .venv). */
export async function resolvePipVirtualEnv(directory: string, virtualEnv?: string): Promise<string> {
  if (virtualEnv) {
    return path.resolve(directory, virtualEnv);
  }

  for (const candidate of VIRTUAL_ENV_CANDIDATES) {
    if (await exists(path.join(directory, candidate, 'pyvenv.cfg'))) {
      return path.join(directory, candidate);
    }
  }

  return path.join(directory, '.venv');
}

/** The directory the marker file lives in. It sits inside the install output so deleting it (rm -rf node_modules) invalidates it. */
async function resolveMarkerDir(manager: PackageManagerId, ctx: ManagerContext, interactive: boolean): Promise<string | undefined> {
  const $ = getPty();

  switch (manager) {
    case 'npm':
    case 'pnpm':
    case 'bun': {
      return path.join(ctx.directory, 'node_modules');
    }

    case 'yarn': {
      // Yarn berry Plug'n'Play installs have no node_modules.
      const pnp = await exists(path.join(ctx.directory, '.pnp.cjs'));
      const nodeModules = await exists(path.join(ctx.directory, 'node_modules'));
      return pnp && !nodeModules ? path.join(ctx.directory, '.yarn') : path.join(ctx.directory, 'node_modules');
    }

    case 'pip': {
      return ctx.pipVirtualEnv;
    }

    case 'poetry':
    case 'pipenv': {
      const cmd = manager === 'poetry' ? 'poetry env info --path' : 'pipenv --venv';
      const { status, data } = await $.spawnSafe(wrapCommand(cmd, ctx.directory, manager, ctx.files), { interactive, env: ctx.options.env });
      const venvPath = data?.trim().split('\n').at(-1)?.trim();
      return status === SpawnStatus.SUCCESS && venvPath && path.isAbsolute(venvPath) ? venvPath : undefined;
    }

    default: {
      return undefined;
    }
  }
}

async function computeMarkerHash(manager: PackageManagerId, ctx: ManagerContext): Promise<string> {
  const contents: Array<[string, string]> = [];
  for (const name of PACKAGE_MANAGERS[manager].hashedFiles ?? []) {
    if (ctx.files.names.has(name)) {
      contents.push([name, await fs.readFile(path.join(ctx.directory, name), 'utf8')]);
    }
  }

  return computeHash(manager, contents, ctx.options);
}

async function readMarker(markerDir: string, manager: PackageManagerId): Promise<string | undefined> {
  try {
    const marker = JSON.parse(await fs.readFile(path.join(markerDir, MARKER_FILE), 'utf8'));
    return marker?.[manager];
  } catch {
    return undefined;
  }
}

async function writeMarker(markerDir: string, manager: PackageManagerId, hash: string): Promise<void> {
  const markerPath = path.join(markerDir, MARKER_FILE);
  let marker: Record<string, string> = {};
  try {
    marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
  } catch {
    // No marker yet.
  }

  await fs.mkdir(markerDir, { recursive: true });
  await fs.writeFile(markerPath, JSON.stringify({ ...marker, [manager]: hash }, null, 2));
}

async function buildContext(directory: string, files: ProjectFiles, manager: PackageManagerId, options: InstallOptions, interactive: boolean): Promise<ManagerContext> {
  const ctx: ManagerContext = { directory, files, options };

  if (manager === 'pip') {
    ctx.pipVirtualEnv = await resolvePipVirtualEnv(directory, options.virtualEnv);
  }

  if (manager === 'yarn') {
    const $ = getPty();
    const { data } = await $.spawnSafe(wrapCommand('yarn --version', directory, manager, files), { interactive, env: options.env });
    ctx.yarnBerry = !data?.trim().split('\n').at(-1)?.startsWith('1.');
  }

  return ctx;
}

async function isManagerInSync(manager: PackageManagerId, ctx: ManagerContext, interactive: boolean): Promise<boolean> {
  const $ = getPty();

  const checkCommand = buildCheckCommand(manager, ctx.options);
  if (checkCommand) {
    const { status } = await $.spawnSafe(wrapCommand(checkCommand, ctx.directory, manager, ctx.files), { interactive, env: ctx.options.env });
    return status === SpawnStatus.SUCCESS;
  }

  const markerDir = await resolveMarkerDir(manager, ctx, interactive);
  if (!markerDir || !(await exists(markerDir))) {
    return false;
  }

  const [expected, actual] = await Promise.all([computeMarkerHash(manager, ctx), readMarker(markerDir, manager)]);
  return expected === actual;
}

// ---------------------------------------------------------------------------
// Public API used by the project-install and project-installs resources
// ---------------------------------------------------------------------------

export interface DirectoryStatus {
  exists: boolean;
  managers: PackageManagerId[];
  stale: PackageManagerId[];
}

/**
 * Reports which managers apply to a directory and which of them are out of date. Never throws for an unusable
 * explicit manager list; that is reported as stale so the error surfaces at apply time with a clear message.
 */
export async function getDirectoryStatus(directory: string, options: InstallOptions, interactive = false): Promise<DirectoryStatus> {
  const files = await readProjectFiles(directory);
  if (!files) {
    return { exists: false, managers: [], stale: [] };
  }

  let managers: PackageManagerId[];
  try {
    managers = resolvePackageManagers(directory, files, options.packageManagers);
  } catch {
    return { exists: true, managers: options.packageManagers ?? [], stale: options.packageManagers ?? [] };
  }

  const stale: PackageManagerId[] = [];
  for (const manager of managers) {
    const ctx = await buildContext(directory, files, manager, options, interactive);
    if (!(await isManagerInSync(manager, ctx, interactive))) {
      stale.push(manager);
    }
  }

  return { exists: true, managers, stale };
}

/** True when the directory exists, has at least one package manager, and every one of them is up to date. */
export async function isDirectoryInSync(directory: string, options: InstallOptions): Promise<boolean> {
  const status = await getDirectoryStatus(directory, options);
  return status.exists && status.managers.length > 0 && status.stale.length === 0;
}

/** Installs dependencies for every out-of-date package manager in a directory. */
export async function installDirectory(directory: string, options: InstallOptions): Promise<void> {
  const $ = getPty();

  const files = await readProjectFiles(directory);
  if (!files) {
    throw new Error(`project-install: the directory ${directory} does not exist. If it is a repository, add a "git-repository" or "git-repositories" resource that clones it.`);
  }

  const managers = resolvePackageManagers(directory, files, options.packageManagers);
  if (managers.length === 0) {
    throw new Error(`project-install: no supported package manager files were found in ${directory}. Supported: ${PACKAGE_MANAGER_IDS.join(', ')}. Use "packageManagers" to choose one explicitly.`);
  }

  for (const manager of managers) {
    const ctx = await buildContext(directory, files, manager, options, true);
    if (await isManagerInSync(manager, ctx, true)) {
      continue;
    }

    const definition = PACKAGE_MANAGERS[manager];
    const { status } = await $.spawnSafe(wrapCommand(`command -v ${definition.binary}`, directory, manager, files), { interactive: true, env: options.env });
    if (status === SpawnStatus.ERROR) {
      throw new Error(`project-install: "${definition.binary}" is required to install ${manager} dependencies in ${directory} but it was not found. ${definition.installHint}`);
    }

    await $.spawn(wrapCommand(buildInstallCommand(manager, ctx), directory, manager, files), { interactive: true, env: options.env });

    if (definition.hashedFiles) {
      const markerDir = await resolveMarkerDir(manager, ctx, true);
      if (markerDir) {
        await writeMarker(markerDir, manager, await computeMarkerHash(manager, ctx));
      }
    }
  }
}
