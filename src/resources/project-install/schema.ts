import { z } from '@codifycli/plugin-core';

import { PACKAGE_MANAGER_IDS } from './package-managers.js';

export const sharedInstallOptions = {
  packageManagers: z
    .array(z.enum(PACKAGE_MANAGER_IDS))
    .describe('Package managers to install with. If omitted, every supported package manager is detected from the project files (one per ecosystem).')
    .optional(),
  frozenLockfile: z
    .boolean()
    .describe('Install exactly what the lockfile says and fail if it is out of date (npm ci, pnpm --frozen-lockfile, yarn --immutable, uv sync --locked, pipenv --deploy, ...). Defaults to false.')
    .optional(),
  args: z
    .array(z.string())
    .describe('Extra arguments appended to every install command (e.g. ["--prefer-offline"]).')
    .optional(),
  env: z
    .record(z.string().regex(/^[A-Z_a-z]\w*$/, 'Environment variable names may only contain letters, digits and underscores'), z.string())
    .describe('Environment variables for the install commands, e.g. a token for a private registry.')
    .optional(),
  virtualEnv: z
    .string()
    .describe('pip only: the virtualenv to install into, relative to the project directory. Defaults to an existing .venv, venv or env directory, otherwise .venv (created if missing).')
    .optional(),
};

export const DEPENDENCIES = [
  'git-repository',
  'git-repositories',
  'homebrew',
  'asdf',
  'asdf-install',
  'nvm',
  'fnm',
  'npm',
  'npm-login',
  'pnpm',
  'pyenv',
  'uv',
  'pip',
  'venv-project',
  'virtualenv-project',
  'rbenv',
  'goenv',
  'file',
  'remote-file',
  'env-file',
  'env-files',
];
