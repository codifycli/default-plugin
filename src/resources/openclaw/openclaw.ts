import {
  ApplyNotes,
  CodifyCliSender,
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
      .describe('Sets a base allowlist of tools before allow/deny rules are applied.'),
    allow: z.array(z.string()).optional()
      .describe('Tool IDs or group: references to allow (e.g. "exec", "group:fs"). Case-insensitive, supports * wildcards.'),
    deny: z.array(z.string()).optional()
      .describe('Tool IDs or group: references to block. Deny rules take precedence over allow rules.'),
    byProvider: z.record(z.string(), z.looseObject({
      profile: z.enum(['minimal', 'coding', 'messaging', 'full']).optional()
        .describe('Base tool allowlist profile for this provider.'),
      allow: z.array(z.string()).optional()
        .describe('Tools to allow for this provider.'),
      deny: z.array(z.string()).optional()
        .describe('Tools to deny for this provider.'),
    })).optional()
      .describe('Applies different tool restrictions per provider or model (keyed by provider/model ID).'),
    toolsBySender: z.record(z.string(), z.looseObject({
      alsoAllow: z.array(z.string()).optional()
        .describe('Additional tools to allow for this sender on top of the global policy.'),
      allow: z.array(z.string()).optional()
        .describe('Explicit tool allowlist for this sender.'),
      deny: z.array(z.string()).optional()
        .describe('Tools to deny for this sender.'),
    })).optional()
      .describe('Restricts tools based on the requester\'s identity (keyed by channel, user ID, or * for default).'),
    web: z.looseObject({
      fetch: z.looseObject({ enabled: z.boolean().optional() }).optional()
        .describe('Configures webpage retrieval capabilities, including provider selection and character limits.'),
      search: z.looseObject({ enabled: z.boolean().optional() }).optional()
        .describe('Enables web search functionality with API key configuration and result limits.'),
    }).optional()
      .describe('Web fetch and search tool settings.'),
    codeMode: z.boolean().optional()
      .describe('Activates a generic code-execution surface where models interact through exec and wait rather than traditional tools.'),
    elevated: z.looseObject({ allowFrom: z.array(z.string()).optional() }).optional()
      .describe('Controls whether agents can execute commands outside the sandbox; allowFrom restricts which senders can trigger elevated execution.'),
    exec: z.looseObject({ timeout: z.number().optional() }).optional()
      .describe('Manages command execution behaviour, including timeouts, cleanup intervals, and patch application settings.'),
    loopDetection: z.looseObject({ enabled: z.boolean().optional() }).optional()
      .describe('Detects and prevents tool-call loops through pattern recognition and configurable thresholds.'),
    sandbox: z.looseObject({}).optional()
      .describe('Filters which tools remain accessible within sandboxed sessions, including MCP servers and plugins.'),
    experimental: z.looseObject({}).optional()
      .describe('Enables beta features such as the structured update_plan tool for multi-step work tracking.'),
    media: z.looseObject({}).optional()
      .describe('Configures audio, image, and video understanding capabilities with model selection and size limits.'),
    agentToAgent: z.looseObject({}).optional()
      .describe('Controls whether agents can invoke other configured agents as tools.'),
    sessions: z.looseObject({}).optional()
      .describe('Defines visibility scope for session tools — whether agents can access current, spawned, agent-wide, or all sessions.'),
    sessions_spawn: z.looseObject({}).optional()
      .describe('Permits inline file attachments when spawning subagent sessions with configurable file and size limits.'),
    subagents: z.looseObject({}).optional()
      .describe('Sets defaults for spawned subagents, including model selection, concurrency limits, and timeout behaviour.'),
  })
  .describe('Tool visibility and policy. Use allow/deny at the top level — there is no tools.policy key.');

// skills: strict so skills.workspace and skills.autoLoad (invalid) are caught
const skillsSchema = z
  .strictObject({
    allowBundled: z.array(z.string()).optional()
      .describe('Optional allowlist restricting which bundled skills are active; managed and workspace skills are unaffected.'),
    load: z.looseObject({
      extraDirs: z.array(z.string()).optional()
        .describe('Shared skill root directories with lowest search precedence. Use this instead of the non-existent skills.workspace key.'),
      allowSymlinkTargets: z.array(z.string()).optional()
        .describe('Trusted real target roots that skill symlinks may resolve into outside their configured source.'),
      watch: z.boolean().optional()
        .describe('When enabled, watches skill directories for SKILL.md changes and reloads automatically.'),
      watchDebounceMs: z.number().optional()
        .describe('Debounce delay in milliseconds for skill directory watch events (default: 250).'),
    }).optional()
      .describe('Skill discovery and loading configuration.'),
    install: z.looseObject({
      preferBrew: z.boolean().optional()
        .describe('When enabled, prioritises Homebrew installers before falling back to other methods.'),
      nodeManager: z.enum(['npm', 'pnpm', 'yarn', 'bun']).optional()
        .describe('Selects the Node.js package manager used for skill metadata install specs.'),
      allowUploadedArchives: z.boolean().optional()
        .describe('Permits gateway admin clients to install private zip archives staged through skills.upload.'),
    }).optional()
      .describe('Skill installation preferences.'),
    workshop: z.looseObject({
      allowSymlinkTargetWrites: z.boolean().optional()
        .describe('Controls whether Skill Workshop apply can write through already-trusted symlink targets.'),
    }).optional()
      .describe('Skill Workshop settings for developing and editing skills.'),
    entries: z.record(z.string(), z.looseObject({
      enabled: z.boolean().optional()
        .describe('Disables a skill even if it is bundled or installed.'),
      apiKey: z.union([z.string(), z.object({ source: z.string(), provider: z.string(), id: z.string() })]).optional()
        .describe('Convenience field for skills declaring a primary environment variable; accepts a plaintext string or a SecretRef object.'),
      env: z.record(z.string(), z.string()).optional()
        .describe('Skill-scoped environment variables injected at runtime.'),
      config: z.record(z.string(), z.unknown()).optional()
        .describe('Plugin-defined configuration object validated against the skill\'s own schema.'),
    })).optional()
      .describe('Per-skill overrides keyed by skill ID.'),
  })
  .describe('Skill management. Use skills.load.extraDirs for extra skill paths — there is no skills.workspace or skills.autoLoad key.');

// cron: strict so cron.jobs (invalid — jobs live in ~/.openclaw/cron/jobs.json) is caught
const cronSchema = z
  .strictObject({
    enabled: z.boolean().optional()
      .describe('Master toggle for cron job functionality.'),
    maxConcurrentRuns: z.number().optional()
      .describe('Maximum number of concurrently active cron sessions including dispatch and isolated execution.'),
    sessionRetention: z.union([z.string(), z.literal(false)]).optional()
      .describe('Duration to keep completed isolated cron run sessions (e.g. "24h"); set false to disable retention.'),
    webhookToken: z.string().optional()
      .describe('Optional bearer token for authenticating outbound cron webhook POST deliveries.'),
    store: z.string().optional()
      .describe('Path to the jobs store file (default: ~/.openclaw/cron/jobs.json). Note: jobs are defined here, not in openclaw.json.'),
    retry: z.looseObject({
      maxAttempts: z.number().min(0).max(10).optional()
        .describe('Maximum number of retries for cron jobs on transient errors (range 0–10).'),
      backoffMs: z.array(z.number()).optional()
        .describe('Array of delay intervals in milliseconds applied sequentially for each retry attempt.'),
      retryOn: z.array(z.enum(['rate_limit', 'overloaded', 'network', 'timeout', 'server_error'])).optional()
        .describe('Error types that trigger a retry attempt.'),
    }).optional()
      .describe('Retry policy for failed cron job runs.'),
    runLog: z.looseObject({
      maxBytes: z.string().optional()
        .describe('Maximum size of cron run log files before rotation (e.g. "2mb").'),
      keepLines: z.number().optional()
        .describe('Number of newest run-history rows retained per job.'),
    }).optional()
      .describe('Cron run log retention settings.'),
    failureAlert: z.looseObject({
      enabled: z.boolean().optional()
        .describe('Activates automatic failure notifications for cron jobs.'),
      after: z.number().min(1).optional()
        .describe('Number of consecutive failures required before an alert fires.'),
      cooldownMs: z.number().optional()
        .describe('Minimum milliseconds between repeated alerts for the same job.'),
    }).optional()
      .describe('Alerting behaviour when cron jobs fail repeatedly.'),
    failureDestination: z.looseObject({
      mode: z.enum(['announce', 'webhook']).optional()
        .describe('Delivery method for failure alerts: announce sends to a channel, webhook POSTs to a URL.'),
      channel: z.string().optional()
        .describe('Target channel for announce-mode failure alerts.'),
      to: z.string().optional()
        .describe('Target user or channel identifier for failure alert delivery.'),
    }).optional()
      .describe('Global default destination for cron failure notifications across all jobs.'),
  })
  .describe('Cron scheduling settings. Jobs are stored separately in ~/.openclaw/cron/jobs.json — there is no cron.jobs key in openclaw.json.');

const gatewaySchema = z
  .looseObject({
    mode: z.enum(['local', 'remote'])
      .describe('Whether the gateway runs locally or connects to a remote instance.'),
    port: z.number().optional()
      .describe('Single multiplexed port for WebSocket and HTTP communication (default: 18789).'),
    bind: z.enum(['auto', 'loopback', 'lan', 'tailnet', 'custom']).optional()
      .describe('Network interface the gateway listens on: loopback (localhost only), lan (all interfaces), tailnet (Tailscale), or custom.'),
    auth: z.looseObject({
      mode: z.enum(['none', 'token', 'password', 'trusted-proxy']).optional()
        .describe('Authentication strategy for gateway connections.'),
      token: z.string().optional()
        .describe('Shared secret for token-based gateway authentication.'),
      password: z.string().optional()
        .describe('Shared secret for password-based gateway authentication.'),
      allowTailscale: z.boolean().optional()
        .describe('Allows Tailscale Serve identity headers to satisfy Control UI authentication.'),
    }).optional()
      .describe('Gateway authentication settings.'),
    tls: z.looseObject({
      enabled: z.boolean().optional()
        .describe('Activates TLS termination at the gateway listener for HTTPS/WSS connections.'),
      certPath: z.string().optional()
        .describe('Filesystem path to the TLS certificate file.'),
      keyPath: z.string().optional()
        .describe('Filesystem path to the TLS private key file.'),
    }).optional()
      .describe('TLS termination settings for the gateway listener.'),
    reload: z.looseObject({
      mode: z.enum(['off', 'restart', 'hot', 'hybrid']).optional()
        .describe('How configuration changes are applied at runtime: off (manual restart), restart, hot (no downtime), or hybrid.'),
    }).optional()
      .describe('Runtime configuration reload behaviour.'),
  })
  .describe('Gateway server settings. gateway.mode is required for the gateway to start.');

const agentsSchema = z
  .looseObject({
    defaults: z.looseObject({
      workspace: z.string().optional()
        .describe('Default workspace directory for agent operations.'),
      model: z.union([z.string(), z.object({
        primary: z.string(),
        fallbacks: z.array(z.string()).optional(),
      })]).optional()
        .describe('Default LLM model for agent runs, as "provider/model" or an object with primary and fallbacks.'),
      thinkingDefault: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'adaptive', 'max']).optional()
        .describe('Default extended thinking intensity for agents.'),
      skills: z.array(z.string()).optional()
        .describe('Skills available to agents by default; omit to allow all skills.'),
      sandbox: z.looseObject({
        mode: z.enum(['off', 'non-main', 'all']).optional()
          .describe('Sandbox scope: off disables sandboxing, non-main sandboxes all agents except the main session, all sandboxes everything.'),
        scope: z.enum(['session', 'agent', 'shared']).optional()
          .describe('Whether the sandbox is shared across sessions, scoped per agent, or per session.'),
      }).optional()
        .describe('Sandbox constraints for agent execution environments.'),
      heartbeat: z.looseObject({ every: z.string().optional() }).optional()
        .describe('Timing and behaviour for periodic agent check-ins (e.g. every: "30m").'),
      maxConcurrent: z.number().optional()
        .describe('Maximum number of simultaneously active agent sessions.'),
    }).optional()
      .describe('Default settings inherited by all agents unless overridden in agents.list.'),
    list: z.array(z.looseObject({
      id: z.string()
        .describe('Stable identifier for this agent, used in bindings and references.'),
      name: z.string().optional()
        .describe('Display name for this agent shown in the UI.'),
      workspace: z.string().optional()
        .describe('Workspace directory for this agent, overrides defaults.workspace.'),
      model: z.string().optional()
        .describe('LLM model for this agent, overrides defaults.model.'),
      skills: z.array(z.string()).optional()
        .describe('Skills available to this agent; overrides defaults.skills entirely when set.'),
    })).optional()
      .describe('Named agent definitions, each with its own identity, model, and capabilities.'),
  })
  .describe('Agent defaults and named agent list. Named agents go in agents.list (array with id field) — there is no agents.workers key.');

const browserSchema = z
  .looseObject({
    enabled: z.boolean().optional()
      .describe('Toggles browser automation functionality on or off.'),
    headless: z.boolean().optional()
      .describe('Controls whether browser windows are shown during automation (default: false).'),
    executablePath: z.string().optional()
      .describe('Path to a custom Chromium-based browser binary; auto-detected if omitted.'),
    defaultProfile: z.string().optional()
      .describe('Browser profile to load by default for agent automation.'),
    noSandbox: z.boolean().optional()
      .describe('Disables browser sandbox isolation — only use when the OS sandbox is unavailable.'),
    tabCleanup: z.looseObject({
      enabled: z.boolean().optional()
        .describe('Enables automatic cleanup of idle browser tabs (default: true).'),
      idleMinutes: z.number().optional()
        .describe('Minutes a tab must be idle before it is eligible for cleanup (default: 120).'),
      maxTabsPerSession: z.number().optional()
        .describe('Maximum open tabs per session before forced cleanup (default: 8).'),
    }).optional()
      .describe('Automatic cleanup of idle or excess browser tabs per session.'),
    ssrfPolicy: z.looseObject({
      dangerouslyAllowPrivateNetwork: z.boolean().optional()
        .describe('Allows browser navigation to private/internal network addresses — dangerous, off by default.'),
      hostnameAllowlist: z.array(z.string()).optional()
        .describe('Hostnames or patterns (e.g. "*.example.com") that are always permitted regardless of SSRF policy.'),
    }).optional()
      .describe('Private network access restrictions and hostname allowlists for browser navigation.'),
    profiles: z.record(z.string(), z.looseObject({})).optional()
      .describe('Named browser profile configurations, each with distinct CDP ports, colours, and executables.'),
  })
  .describe('Chromium browser control settings.');

const mcpSchema = z
  .looseObject({
    servers: z.record(z.string(), z.looseObject({
      enabled: z.boolean().optional()
        .describe('Whether this MCP server is active (default: true).'),
      command: z.string().optional()
        .describe('Executable to launch for stdio-transport servers (e.g. "npx").'),
      args: z.array(z.string()).optional()
        .describe('Arguments passed to the stdio command.'),
      env: z.record(z.string(), z.string()).optional()
        .describe('Extra environment variables injected into the stdio server process.'),
      url: z.string().optional()
        .describe('URL for HTTP/SSE-transport servers.'),
      transport: z.enum(['streamable-http', 'sse']).optional()
        .describe('Transport protocol for remote servers (default: sse).'),
      headers: z.record(z.string(), z.string()).optional()
        .describe('HTTP headers sent with every request to remote servers (e.g. Authorization).'),
      toolFilter: z.object({
        include: z.array(z.string()).optional()
          .describe('MCP tool names or glob patterns to expose from this server.'),
        exclude: z.array(z.string()).optional()
          .describe('MCP tool names or glob patterns to hide from this server.'),
      }).optional()
        .describe('Allowlist/denylist filter for which tools this server exposes to agents.'),
    })).optional()
      .describe('Named MCP server definitions, keyed by server name.'),
    sessionIdleTtlMs: z.number().optional()
      .describe('Idle time-to-live in milliseconds for session-scoped MCP runtimes before cleanup (default: 600000).'),
  })
  .describe('Model Context Protocol server definitions.');

// Top-level settings: loose so undocumented sections (hooks, session, memory, etc.) pass through
export const settingsSchema = z
  .looseObject({
    gateway: gatewaySchema.optional()
      .describe('Gateway server settings (port, bind address, auth, TLS, reload behaviour).'),
    agents: agentsSchema.optional()
      .describe('Agent defaults and named agent list.'),
    channels: z.record(z.string(), z.looseObject({})).optional()
      .describe('Per-channel configuration keyed by provider name (telegram, slack, discord, whatsapp, etc.).'),
    tools: toolsSchema.optional()
      .describe('Tool visibility and policy (allow/deny lists, per-provider and per-sender overrides).'),
    skills: skillsSchema.optional()
      .describe('Skill discovery, installation, and per-skill overrides.'),
    cron: cronSchema.optional()
      .describe('Cron scheduling settings. Individual jobs are defined in ~/.openclaw/cron/jobs.json, not here.'),
    browser: browserSchema.optional()
      .describe('Chromium browser automation settings.'),
    mcp: mcpSchema.optional()
      .describe('Model Context Protocol server definitions.'),
    models: z.looseObject({
      mode: z.enum(['merge', 'replace']).optional()
        .describe('How custom provider models combine with the built-in catalog: merge adds them, replace removes built-ins.'),
      providers: z.record(z.string(), z.looseObject({})).optional()
        .describe('Custom model provider definitions keyed by provider ID, each with a baseUrl, apiKey, and models list.'),
    }).optional()
      .describe('Custom LLM provider and model catalog configuration.'),
    plugins: z.looseObject({
      enabled: z.boolean().optional()
        .describe('Master switch for all plugin functionality; false disables discovery entirely.'),
      allow: z.array(z.string()).optional()
        .describe('Exclusive allowlist — when set, only listed plugins load.'),
      deny: z.array(z.string()).optional()
        .describe('Blocklist — deny overrides both allow and per-plugin enablement.'),
      load: z.looseObject({ paths: z.array(z.string()).optional() }).optional()
        .describe('Additional filesystem directories where standalone plugins are discovered.'),
      entries: z.record(z.string(), z.looseObject({
        enabled: z.boolean().optional()
          .describe('Enables or disables this plugin.'),
        config: z.record(z.string(), z.unknown()).optional()
          .describe('Plugin-defined configuration object.'),
      })).optional()
        .describe('Per-plugin configuration keyed by plugin ID.'),
    }).optional()
      .describe('Plugin system configuration.'),
    env: z.looseObject({
      vars: z.record(z.string(), z.string()).optional()
        .describe('Inline environment variables applied when not already present in the process.'),
      shellEnv: z.looseObject({ enabled: z.boolean().optional() }).optional()
        .describe('When enabled, imports missing environment variables from the system login shell profile.'),
    }).optional()
      .describe('Environment variable injection for the gateway process.'),
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

    CodifyCliSender.sendApplyNote(ApplyNotes.NEW_SHELL_REQUIRED, 'openclaw');
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
