import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
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

import { HERMES_DIR, mutateHermesConfig, readHermesConfig } from './hermes-agent-config.js';
import { McpServersParameter } from './mcp-servers-parameter.js';

const mcpServerSchema = z.object({
  name: z.string().describe('Unique name for this MCP server. Used as its key under mcp_servers in config.yaml'),
  command: z.string().optional().describe('Executable to launch for a stdio MCP server'),
  args: z.array(z.string()).optional().describe('Arguments passed to the command for a stdio MCP server'),
  env: z.record(z.string(), z.string()).optional().describe('Environment variables passed to the server process'),
  url: z.string().optional().describe('Remote endpoint for an HTTP MCP server'),
  headers: z.record(z.string(), z.string()).optional().describe('HTTP headers sent with every request to an HTTP MCP server'),
  enabled: z.boolean().optional().describe('Whether this MCP server is active (default: true)'),
}).refine((data) => (data.command != null) !== (data.url != null), {
  message: 'MCP server must specify either "command" (stdio) or "url" (http), but not both',
});

export type McpServer = z.infer<typeof mcpServerSchema>;

const schema = z
  .object({
    model: z
      .object({
        provider: z.string().optional().describe('LLM provider id, e.g. "anthropic", "openai", "deepseek"'),
        default: z.string().optional().describe('Default model id, e.g. "anthropic/claude-opus-4"'),
      })
      .optional()
      .describe('Default LLM provider and model, written to ~/.hermes/config.yaml under model'),
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone used for scheduling and reports, e.g. "America/New_York"'),
    approvalsMode: z
      .enum(['manual', 'smart', 'off'])
      .optional()
      .describe('Tool approval policy: "manual" asks every time, "smart" auto-approves low-risk actions, "off" disables approvals'),
    mcpServers: z
      .array(mcpServerSchema)
      .optional()
      .describe('MCP servers registered in ~/.hermes/config.yaml under mcp_servers'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/hermes-agent' })
  .describe('Hermes Agent installation and configuration management');

export type HermesAgentConfig = z.infer<typeof schema>;

const defaultConfig: Partial<HermesAgentConfig> = {
  approvalsMode: 'manual',
  mcpServers: [],
};

const exampleBasic: ExampleConfig = {
  title: 'Hermes Agent with a default model and MCP server',
  description: 'Install Hermes Agent, set the default LLM provider/model, and register a filesystem MCP server.',
  configs: [
    {
      type: 'hermes-agent',
      model: {
        provider: 'anthropic',
        default: 'anthropic/claude-opus-4',
      },
      mcpServers: [
        {
          name: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      ],
    },
  ],
};

const exampleAdvanced: ExampleConfig = {
  title: 'Hermes Agent with timezone, approvals, and a remote MCP server',
  description: 'Configure scheduling timezone, set tool approvals to smart mode, and connect a remote HTTP MCP server.',
  configs: [
    {
      type: 'hermes-agent',
      timezone: 'America/New_York',
      approvalsMode: 'smart',
      mcpServers: [
        {
          name: 'remote-tools',
          url: 'https://mcp.example.com/sse',
          headers: {
            Authorization: 'Bearer <Replace me here!>',
          },
        },
      ],
    },
  ],
};

export class HermesAgentResource extends Resource<HermesAgentConfig> {
  getSettings(): ResourceSettings<HermesAgentConfig> {
    return {
      id: 'hermes-agent',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleAdvanced,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['git'],
      parameterSettings: {
        model: { canModify: true },
        timezone: { canModify: true },
        approvalsMode: { canModify: true },
        mcpServers: { type: 'stateful', definition: new McpServersParameter(), order: 1 },
      },
    };
  }

  async refresh(parameters: Partial<HermesAgentConfig>): Promise<Partial<HermesAgentConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('hermes version');
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    const result: Partial<HermesAgentConfig> = {};
    const config = await readHermesConfig();

    if (parameters.model != null) {
      const model = config['model'];
      if (model && typeof model === 'object') {
        result.model = model as HermesAgentConfig['model'];
      }
    }

    if (parameters.timezone != null) {
      const timezone = config['timezone'];
      if (typeof timezone === 'string') {
        result.timezone = timezone;
      }
    }

    if (parameters.approvalsMode != null) {
      const approvals = config['approvals'];
      if (approvals && typeof approvals === 'object') {
        const mode = (approvals as Record<string, unknown>)['mode'];
        if (typeof mode === 'string') {
          result.approvalsMode = mode as HermesAgentConfig['approvalsMode'];
        }
      }
    }

    return result;
  }

  async create(plan: CreatePlan<HermesAgentConfig>): Promise<void> {
    const $ = getPty();

    await $.spawn(
      'bash -c "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash"',
      { interactive: true },
    );

    // Ensure PATH is updated so subsequent lifecycle methods can call `hermes`
    const localBin = path.join(os.homedir(), '.local', 'bin');
    process.env['PATH'] = `${localBin}:${process.env['PATH'] ?? ''}`;

    const { model, timezone, approvalsMode } = plan.desiredConfig;
    if (model != null || timezone != null || approvalsMode != null) {
      await this.writeSettings(model, timezone, approvalsMode);
    }
  }

  async modify(
    pc: ParameterChange<HermesAgentConfig>,
    plan: ModifyPlan<HermesAgentConfig>,
  ): Promise<void> {
    if (pc.name === 'model' || pc.name === 'timezone' || pc.name === 'approvalsMode') {
      const { model, timezone, approvalsMode } = plan.desiredConfig;
      await this.writeSettings(model, timezone, approvalsMode);
    }
  }

  async destroy(_plan: DestroyPlan<HermesAgentConfig>): Promise<void> {
    const $ = getPty();

    await $.spawnSafe('hermes uninstall --full', { interactive: true });

    await fs.rm(HERMES_DIR, { recursive: true, force: true });
    await fs.rm(path.join(os.homedir(), '.local', 'bin', 'hermes'), { force: true });
  }

  private async writeSettings(
    model: HermesAgentConfig['model'],
    timezone: HermesAgentConfig['timezone'],
    approvalsMode: HermesAgentConfig['approvalsMode'],
  ): Promise<void> {
    await mutateHermesConfig((config) => {
      if (model != null) {
        config['model'] = { ...(config['model'] as object | undefined), ...model };
      }

      if (timezone != null) {
        config['timezone'] = timezone;
      }

      if (approvalsMode != null) {
        config['approvals'] = { ...(config['approvals'] as object | undefined), mode: approvalsMode };
      }
    });
  }
}
