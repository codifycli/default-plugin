import {
  ExampleConfig,
  PackageManager,
  Resource,
  ResourceSettings,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import { requiresOnMacOS } from '../../utils/requires.js';

const CODEX_APP_PATH = '/Applications/Codex.app';

const schema = z
  .object({})
  .meta({ $comment: 'https://codifycli.com/docs/resources/codex/codex-app' })
  .describe('Codex desktop app installation');

export type CodexAppConfig = z.infer<typeof schema> & StringIndexedObject;

const exampleBasic: ExampleConfig = {
  title: 'Install the Codex desktop app',
  description: 'Install the Codex desktop app (the "Codex command center") via Homebrew cask.',
  configs: [
    {
      type: 'codex-app',
      os: ['macOS'],
    },
  ],
};

export class CodexAppResource extends Resource<CodexAppConfig> {
  getSettings(): ResourceSettings<CodexAppConfig> {
    return {
      id: 'codex-app',
      requires: requiresOnMacOS('homebrew'),
      operatingSystems: [OS.Darwin],
      schema,
      exampleConfigs: {
        example1: exampleBasic,
      },
    };
  }

  async refresh(): Promise<Partial<CodexAppConfig> | null> {
    try {
      await fs.access(CODEX_APP_PATH);
    } catch {
      return null;
    }

    return {};
  }

  async create(): Promise<void> {
    await Utils.installViaPkgMgr('codex-app', { [PackageManager.BREW]: { cask: true } }, PackageManager.BREW);
  }

  async destroy(): Promise<void> {
    try {
      await Utils.uninstallViaPkgMgr('codex-app', { [PackageManager.BREW]: { cask: true } }, PackageManager.BREW);
    } catch {
      // Homebrew is gone: remove the app directly below
    }

    await getPty().spawnSafe(`rm -rf "${CODEX_APP_PATH}"`);
  }
}
