import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { OpenClawSettingsParameter } from './settings-parameter.js';

const schema = z
  .object({
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Top-level keys to merge into ~/.openclaw/openclaw.json. Supports gateway, agents, ' +
        'models, channels, tools, skills, plugins, mcp, browser, cron, and all other ' +
        'OpenClaw configuration sections.'
      ),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/openclaw/openclaw' })
  .describe('OpenClaw installation and gateway configuration management');

export type OpenClawConfig = z.infer<typeof schema>;

const defaultConfig: Partial<OpenClawConfig> = {
  settings: {},
};

const exampleBasic: ExampleConfig = {
  title: 'Install OpenClaw with gateway and agent defaults',
  description:
    'Install OpenClaw and configure the local gateway port/bind address along with the ' +
    'default agent model.',
  configs: [
    {
      type: 'openclaw',
      settings: {
        gateway: { port: 18789, bind: 'loopback' },
        agents: { defaults: { model: 'anthropic/claude-sonnet-4-6' } },
      },
    },
  ],
};

const exampleWithChannels: ExampleConfig = {
  title: 'OpenClaw with a Telegram channel and restricted tools',
  description:
    'Install OpenClaw, connect a Telegram bot channel restricted to an allowlist, and limit ' +
    'the agent tool policy to a safe subset.',
  configs: [
    {
      type: 'openclaw',
      settings: {
        channels: {
          telegram: {
            botToken: '<Replace me here!>',
            dmPolicy: 'allowlist',
            allowFrom: ['123456789'],
          },
        },
        tools: {
          policy: { allow: ['exec', 'read', 'write', 'web_search'] },
        },
      },
    },
  ],
};

export class OpenClawResource extends Resource<OpenClawConfig> {
  getSettings(): ResourceSettings<OpenClawConfig> {
    return {
      id: 'openclaw',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleWithChannels,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        settings: { type: 'stateful', definition: new OpenClawSettingsParameter(), order: 1 },
      },
    };
  }

  async refresh(_parameters: Partial<OpenClawConfig>): Promise<Partial<OpenClawConfig> | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which openclaw');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    return {};
  }

  async create(_plan: CreatePlan<OpenClawConfig>): Promise<void> {
    const $ = getPty();

    await $.spawn(
      'bash -c "curl -fsSL https://openclaw.ai/install.sh | bash"',
      { interactive: true },
    );

    // Ensure PATH is updated so subsequent lifecycle methods can call `openclaw`
    const localBin = path.join(os.homedir(), '.local', 'bin');
    process.env['PATH'] = `${localBin}:${process.env['PATH'] ?? ''}`;
  }

  async destroy(_plan: DestroyPlan<OpenClawConfig>): Promise<void> {
    const $ = getPty();

    await $.spawnSafe('openclaw gateway stop', { interactive: true });
    await $.spawnSafe('npm uninstall -g openclaw', { interactive: true });
    await $.spawnSafe('rm -f ~/.local/bin/openclaw', { interactive: true });

    await fs.rm(path.join(os.homedir(), '.openclaw'), { recursive: true, force: true });
  }
}
