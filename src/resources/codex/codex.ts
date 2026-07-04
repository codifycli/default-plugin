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

const codexConfigSchema = z
  .object({
    model: z.string().optional().describe('Model name to use (e.g. "o4-mini", "gpt-4.1").'),
    model_provider: z.string().optional().describe('Provider for the model (e.g. "openai", "anthropic", "gemini").'),
    model_reasoning_effort: z
      .enum(['minimal', 'low', 'medium', 'high', 'xhigh'])
      .optional()
      .describe('Reasoning effort level for supported models.'),
    model_reasoning_summary: z
      .enum(['auto', 'concise', 'detailed', 'none'])
      .optional()
      .describe('How much detail to include in reasoning summaries.'),
    approval_policy: z
      .enum(['untrusted', 'on-request', 'never'])
      .optional()
      .describe(
        'When Codex asks for approval before running commands. ' +
        '"untrusted" auto-approves known-safe read-only commands; "on-request" lets the model decide; "never" auto-approves everything.',
      ),
    sandbox_mode: z
      .enum(['read-only', 'workspace-write', 'danger-full-access'])
      .optional()
      .describe('Sandbox policy controlling what filesystem writes are allowed.'),
    sandbox_workspace_write: z
      .boolean()
      .optional()
      .describe('Allow writes within the workspace directory when sandbox_mode is active.'),
    web_search: z
      .enum(['disabled', 'cached', 'live'])
      .optional()
      .describe(
        'Web search access for the agent. "cached" uses an OpenAI-maintained index (default); ' +
        '"live" fetches the most recent data; "disabled" removes the tool.',
      ),
    shell_environment_policy: z
      .object({
        inherit: z.enum(['all', 'core', 'none']).optional(),
      })
      .optional()
      .describe(
        'Which shell environment variables to inherit. "all" passes everything through; ' +
        '"core" keeps PATH and a minimal set; "none" starts with an empty environment.',
      ),
    history: z
      .object({
        persistence: z.enum(['save-all', 'none']).optional(),
      })
      .optional()
      .describe('Session history settings. Set persistence to "save-all" to keep history or "none" to disable it.'),
    file_opener: z
      .enum(['vscode', 'vscode-insiders', 'windsurf', 'cursor', 'none'])
      .optional()
      .describe('Editor used when Codex opens a file.'),
  })
  .catchall(z.unknown())
  .describe('Typed Codex config keys. Unknown keys are passed through as-is.');

const schema = z
  .object({
    config: codexConfigSchema
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
        model: 'o4-mini',
        approval_policy: 'untrusted',
        sandbox_mode: 'workspace-write',
        web_search: 'cached',
      },
    },
  ],
};

const exampleWithMcp: ExampleConfig = {
  title: 'Codex with an MCP server',
  description: 'Install the Codex CLI and register a custom MCP server available to every project.',
  configs: [
    {
      type: 'codex',
      mcpServers: [
        {
          name: 'my-mcp-server',
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'my-mcp-package'],
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
      'bash -c "curl -fsSL --retry 5 --retry-delay 3 --retry-all-errors https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh"',
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
