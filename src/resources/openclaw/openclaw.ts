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

// ── Per-section schemas matching docs.openclaw.ai/gateway/configuration-reference ──

// tools: strict so tools.policy (invalid) is caught at validation time
const toolsSchema = z
  .strictObject({
    profile: z.enum(['minimal', 'coding', 'messaging', 'full']).optional()
      .describe('Baseline tool allowlist profile.'),
    allow: z.array(z.string()).optional()
      .describe('Tool IDs or group: references to allow (e.g. "exec", "group:fs").'),
    deny: z.array(z.string()).optional()
      .describe('Tool IDs or group: references to deny. Deny wins over allow.'),
    byProvider: z.record(z.string(), z.looseObject({
      profile: z.enum(['minimal', 'coding', 'messaging', 'full']).optional(),
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
    })).optional(),
    toolsBySender: z.record(z.string(), z.looseObject({
      alsoAllow: z.array(z.string()).optional(),
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
    })).optional(),
    web: z.looseObject({
      fetch: z.looseObject({ enabled: z.boolean().optional() }).optional(),
      search: z.looseObject({ enabled: z.boolean().optional() }).optional(),
    }).optional(),
    codeMode: z.boolean().optional(),
    elevated: z.looseObject({ allowFrom: z.array(z.string()).optional() }).optional(),
    exec: z.looseObject({ timeout: z.number().optional() }).optional(),
    loopDetection: z.looseObject({ enabled: z.boolean().optional() }).optional(),
    sandbox: z.looseObject({}).optional(),
    experimental: z.looseObject({}).optional(),
    media: z.looseObject({}).optional(),
    agentToAgent: z.looseObject({}).optional(),
    sessions: z.looseObject({}).optional(),
    sessions_spawn: z.looseObject({}).optional(),
    subagents: z.looseObject({}).optional(),
  })
  .describe('Tool visibility and policy. Use allow/deny at the top level — there is no tools.policy key.');

// skills: strict so skills.workspace and skills.autoLoad (invalid) are caught
const skillsSchema = z
  .strictObject({
    allowBundled: z.array(z.string()).optional()
      .describe('Restrict which bundled skills are available.'),
    load: z.looseObject({
      extraDirs: z.array(z.string()).optional()
        .describe('Additional directories to scan for skills (use instead of skills.workspace).'),
      allowSymlinkTargets: z.array(z.string()).optional(),
      watch: z.boolean().optional(),
      watchDebounceMs: z.number().optional(),
    }).optional(),
    install: z.looseObject({
      preferBrew: z.boolean().optional(),
      nodeManager: z.enum(['npm', 'pnpm', 'yarn', 'bun']).optional(),
      allowUploadedArchives: z.boolean().optional(),
    }).optional(),
    workshop: z.looseObject({
      allowSymlinkTargetWrites: z.boolean().optional(),
    }).optional(),
    entries: z.record(z.string(), z.looseObject({
      enabled: z.boolean().optional(),
      apiKey: z.union([z.string(), z.object({ source: z.string(), provider: z.string(), id: z.string() })]).optional(),
      env: z.record(z.string(), z.string()).optional(),
      config: z.record(z.string(), z.unknown()).optional(),
    })).optional(),
  })
  .describe('Skill management. Use skills.load.extraDirs for extra skill paths — there is no skills.workspace or skills.autoLoad key.');

// cron: strict so cron.jobs (invalid — jobs live in ~/.openclaw/cron/jobs.json) is caught
const cronSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    maxConcurrentRuns: z.number().optional(),
    sessionRetention: z.union([z.string(), z.literal(false)]).optional(),
    webhookToken: z.string().optional(),
    store: z.string().optional()
      .describe('Path to the jobs store file (default: ~/.openclaw/cron/jobs.json).'),
    retry: z.looseObject({
      maxAttempts: z.number().min(0).max(10).optional(),
      backoffMs: z.array(z.number()).optional(),
      retryOn: z.array(z.enum(['rate_limit', 'overloaded', 'network', 'timeout', 'server_error'])).optional(),
    }).optional(),
    runLog: z.looseObject({
      maxBytes: z.string().optional(),
      keepLines: z.number().optional(),
    }).optional(),
    failureAlert: z.looseObject({
      enabled: z.boolean().optional(),
      after: z.number().min(1).optional(),
      cooldownMs: z.number().optional(),
    }).optional(),
    failureDestination: z.looseObject({
      mode: z.enum(['announce', 'webhook']).optional(),
      channel: z.string().optional(),
      to: z.string().optional(),
    }).optional(),
  })
  .describe('Cron scheduling settings. Jobs are stored separately in ~/.openclaw/cron/jobs.json — there is no cron.jobs key in openclaw.json.');

const gatewaySchema = z
  .looseObject({
    mode: z.enum(['local', 'remote']),
    port: z.number().optional(),
    bind: z.enum(['auto', 'loopback', 'lan', 'tailnet', 'custom']).optional(),
    auth: z.looseObject({
      mode: z.enum(['none', 'token', 'password', 'trusted-proxy']).optional(),
      token: z.string().optional(),
      password: z.string().optional(),
      allowTailscale: z.boolean().optional(),
    }).optional(),
    tls: z.looseObject({
      enabled: z.boolean().optional(),
      certPath: z.string().optional(),
      keyPath: z.string().optional(),
    }).optional(),
    reload: z.looseObject({
      mode: z.enum(['off', 'restart', 'hot', 'hybrid']).optional(),
    }).optional(),
  })
  .describe('Gateway server settings.');

const agentsSchema = z
  .looseObject({
    defaults: z.looseObject({
      workspace: z.string().optional(),
      model: z.union([z.string(), z.object({
        primary: z.string(),
        fallbacks: z.array(z.string()).optional(),
      })]).optional(),
      thinkingDefault: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive', 'max']).optional(),
      skills: z.array(z.string()).optional(),
      sandbox: z.looseObject({
        mode: z.enum(['off', 'non-main', 'all']).optional(),
        scope: z.enum(['session', 'agent', 'shared']).optional(),
      }).optional(),
      heartbeat: z.looseObject({ every: z.string().optional() }).optional(),
      maxConcurrent: z.number().optional(),
    }).optional(),
    list: z.array(z.looseObject({
      id: z.string(),
      name: z.string().optional(),
      workspace: z.string().optional(),
      model: z.string().optional(),
      skills: z.array(z.string()).optional(),
    })).optional(),
  })
  .describe('Agent defaults and named agent list.');

const browserSchema = z
  .looseObject({
    enabled: z.boolean().optional(),
    headless: z.boolean().optional(),
    executablePath: z.string().optional(),
    defaultProfile: z.string().optional(),
    noSandbox: z.boolean().optional(),
    tabCleanup: z.looseObject({
      enabled: z.boolean().optional(),
      idleMinutes: z.number().optional(),
      maxTabsPerSession: z.number().optional(),
    }).optional(),
    ssrfPolicy: z.looseObject({
      dangerouslyAllowPrivateNetwork: z.boolean().optional(),
      hostnameAllowlist: z.array(z.string()).optional(),
    }).optional(),
    profiles: z.record(z.string(), z.looseObject({})).optional(),
  })
  .describe('Chromium browser control settings.');

const mcpSchema = z
  .looseObject({
    servers: z.record(z.string(), z.looseObject({
      enabled: z.boolean().optional(),
      command: z.string().optional(),
      args: z.array(z.string()).optional(),
      env: z.record(z.string(), z.string()).optional(),
      url: z.string().optional(),
      transport: z.enum(['streamable-http', 'sse']).optional(),
      headers: z.record(z.string(), z.string()).optional(),
      toolFilter: z.object({
        include: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
      }).optional(),
    })).optional(),
    sessionIdleTtlMs: z.number().optional(),
  })
  .describe('Model Context Protocol server definitions.');

// Top-level settings: loose so undocumented sections (hooks, session, memory, etc.) pass through
export const settingsSchema = z
  .looseObject({
    gateway: gatewaySchema.optional(),
    agents: agentsSchema.optional(),
    channels: z.record(z.string(), z.looseObject({})).optional()
      .describe('Per-channel configuration keyed by provider name (telegram, slack, discord, etc.).'),
    tools: toolsSchema.optional(),
    skills: skillsSchema.optional(),
    cron: cronSchema.optional(),
    browser: browserSchema.optional(),
    mcp: mcpSchema.optional(),
    models: z.looseObject({
      mode: z.enum(['merge', 'replace']).optional(),
      providers: z.record(z.string(), z.looseObject({})).optional(),
    }).optional(),
    plugins: z.looseObject({
      enabled: z.boolean().optional(),
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
      load: z.looseObject({ paths: z.array(z.string()).optional() }).optional(),
      entries: z.record(z.string(), z.looseObject({
        enabled: z.boolean().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      })).optional(),
    }).optional(),
    env: z.looseObject({
      vars: z.record(z.string(), z.string()).optional(),
      shellEnv: z.looseObject({ enabled: z.boolean().optional() }).optional(),
    }).optional(),
  })
  .describe(
    'Top-level keys to merge into ~/.openclaw/openclaw.json. ' +
    'Known sections (gateway, agents, channels, tools, skills, cron, browser, mcp, models, plugins, env) ' +
    'are validated against the OpenClaw config schema. ' +
    'Unknown top-level keys (hooks, session, memory, etc.) pass through as-is.'
  );

const schema = z
  .object({
    settings: settingsSchema.optional(),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/openclaw/openclaw' })
  .describe('OpenClaw installation and gateway configuration management');

export type OpenClawConfig = z.infer<typeof schema>;

const defaultConfig: Partial<OpenClawConfig> = {
  settings: {
    gateway: { mode: 'local' },
  },
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
        gateway: { mode: 'local', port: 18789, bind: 'loopback' },
        agents: { defaults: { model: 'anthropic/claude-sonnet-4-6' } },
      },
    },
  ],
};

const exampleWithChannels: ExampleConfig = {
  title: 'OpenClaw with a Telegram channel and restricted tools',
  description:
    'Install OpenClaw, connect a Telegram bot channel restricted to an allowlist, and limit ' +
    'the agent tool allowlist to a safe subset.',
  configs: [
    {
      type: 'openclaw',
      settings: {
        gateway: { mode: 'local' },
        channels: {
          telegram: {
            botToken: '<Replace me here!>',
            dmPolicy: 'allowlist',
            allowFrom: ['123456789'],
          },
        },
        tools: {
          allow: ['exec', 'read', 'write', 'web_search'],
        },
        skills: {
          load: { extraDirs: ['$HOME/openclaw-skills'] },
        },
        cron: {
          enabled: true,
          maxConcurrentRuns: 8,
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
      'bash -c "curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard --no-prompt"',
      { interactive: true },
    );

    // Ensure PATH is updated so subsequent lifecycle methods can call `openclaw`
    const localBin = path.join(os.homedir(), '.local', 'bin');
    process.env['PATH'] = `${localBin}:${process.env['PATH'] ?? ''}`;

    // Register and start the gateway as a managed background service
    // (launchd on macOS, systemd user unit on Linux). Config is written by
    // the settings StatefulParameter after this returns, then the parameter
    // triggers `openclaw gateway restart` to pick it up.
    await $.spawn('openclaw gateway install', { interactive: true });
    await $.spawn('openclaw gateway start', { interactive: true });
  }

  async destroy(_plan: DestroyPlan<OpenClawConfig>): Promise<void> {
    const $ = getPty();

    await $.spawnSafe('openclaw gateway stop', { interactive: true });
    await $.spawnSafe('openclaw gateway uninstall', { interactive: true });
    await $.spawnSafe('npm uninstall -g openclaw', { interactive: true });
    await $.spawnSafe('rm -f ~/.local/bin/openclaw', { interactive: true });

    await fs.rm(path.join(os.homedir(), '.openclaw'), { recursive: true, force: true });
  }
}
