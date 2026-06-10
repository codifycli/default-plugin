import {
  ExampleConfig,
  Resource,
  ResourceSettings,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';

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
    const $ = getPty();
    await $.spawn('brew install --cask codex-app', {
      interactive: true,
      env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
    });
  }

  async destroy(): Promise<void> {
    const $ = getPty();
    await $.spawnSafe('brew uninstall --cask codex-app', {
      env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
    });
    await $.spawnSafe(`rm -rf "${CODEX_APP_PATH}"`);
  }
}
