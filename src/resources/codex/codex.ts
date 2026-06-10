import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { CodexConfigParameter } from './config-parameter.js';
import { codexMcpServerSchema } from './mcp-server-schema.js';
import { CodexMcpServersParameter } from './mcp-servers-parameter.js';

const schema = z
  .object({
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Settings to merge into ~/.codex/config.toml. Supports model, model_provider, approval_policy, ' +
        'sandbox_mode, sandbox_workspace_write, model_reasoning_effort, model_reasoning_summary, web_search, ' +
        'file_opener, history, shell_environment_policy, and all other Codex config keys.',
      ),
    mcpServers: z
      .array(codexMcpServerSchema)
      .optional()
      .describe('MCP servers to register globally under [mcp_servers] in ~/.codex/config.toml.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/codex/codex' })
  .describe('Codex CLI installation and configuration management');

export type CodexConfig = z.infer<typeof schema>;

const defaultConfig: Partial<CodexConfig> = {
  mcpServers: [],
};

const exampleSettings: ExampleConfig = {
  title: 'Codex with custom settings',
  description: 'Install the Codex CLI and configure the model, approval policy, and sandbox mode.',
  configs: [
    {
      type: 'codex',
      config: {
        model: 'gpt-5.1-codex',
        approval_policy: 'on-request',
        sandbox_mode: 'workspace-write',
      },
    },
  ],
};

const exampleWithMcp: ExampleConfig = {
  title: 'Codex with an MCP server',
  description: 'Install the Codex CLI and register a filesystem MCP server available to every project.',
  configs: [
    {
      type: 'codex',
      mcpServers: [
        {
          name: 'filesystem',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      ],
    },
  ],
};

export class CodexResource extends Resource<CodexConfig> {
  getSettings(): ResourceSettings<CodexConfig> {
    return {
      id: 'codex',
      defaultConfig,
      exampleConfigs: {
        example1: exampleSettings,
        example2: exampleWithMcp,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        config: { type: 'stateful', definition: new CodexConfigParameter(), order: 1 },
        mcpServers: { type: 'stateful', definition: new CodexMcpServersParameter(), order: 2 },
      },
    };
  }

  async refresh(): Promise<Partial<CodexConfig> | null> {
    const codexBin = path.join(os.homedir(), '.local', 'bin', 'codex');
    try {
      await fs.access(codexBin);
    } catch {
      return null;
    }

    return {};
  }

  async create(_plan: CreatePlan<CodexConfig>): Promise<void> {
    const $ = getPty();

    await $.spawn(
      'bash -c "curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh"',
      { interactive: true },
    );

    // Ensure PATH is updated so subsequent lifecycle methods can call `codex`
    const localBin = path.join(os.homedir(), '.local', 'bin');
    process.env['PATH'] = `${localBin}:${process.env['PATH'] ?? ''}`;
  }

  async destroy(_plan: DestroyPlan<CodexConfig>): Promise<void> {
    // Native uninstall: remove the binary and standalone release artifacts
    await fs.rm(path.join(os.homedir(), '.local', 'bin', 'codex'), { force: true });
    await fs.rm(path.join(os.homedir(), '.codex', 'packages', 'standalone'), { recursive: true, force: true });
  }
}
