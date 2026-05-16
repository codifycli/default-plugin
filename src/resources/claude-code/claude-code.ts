import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { McpServersParameter } from './mcp-servers-parameter.js';
import { SettingsParameter } from './settings-parameter.js';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const CLAUDE_MD_PATH = path.join(CLAUDE_DIR, 'CLAUDE.md');

const mcpStdioServerSchema = z.object({
  name: z.string().describe('Unique name for this MCP server'),
  type: z.literal('stdio'),
  command: z.string().describe('Executable or command to launch the server process'),
  args: z.array(z.string()).optional().describe('Arguments to pass to the command'),
  env: z.record(z.string(), z.string()).optional().describe('Environment variables for the server process'),
});

const mcpHttpServerSchema = z.object({
  name: z.string().describe('Unique name for this MCP server'),
  type: z.literal('http'),
  url: z.string().describe('URL of the HTTP (streamable-http) MCP server'),
  headers: z.record(z.string(), z.string()).optional().describe('HTTP headers sent with every request'),
});

const mcpSseServerSchema = z.object({
  name: z.string().describe('Unique name for this MCP server'),
  type: z.literal('sse'),
  url: z.string().describe('URL of the SSE MCP server (deprecated transport; prefer http)'),
  headers: z.record(z.string(), z.string()).optional().describe('HTTP headers sent with every request'),
});

export const mcpServerSchema = z.discriminatedUnion('type', [
  mcpStdioServerSchema,
  mcpHttpServerSchema,
  mcpSseServerSchema,
]);

export type McpServer = z.infer<typeof mcpServerSchema>;

const schema = z
  .object({
    globalClaudeMd: z
      .string()
      .optional()
      .describe(
        'Content to write to ~/.claude/CLAUDE.md. Claude Code reads this at the start of ' +
        'every session, making it the ideal place for global coding standards and preferences.',
      ),
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Settings to merge into ~/.claude/settings.json. Supports model, effortLevel, ' +
        'editorMode, permissions, env, hooks, and all other Claude Code settings.',
      ),
    mcpServers: z
      .array(mcpServerSchema)
      .optional()
      .describe('MCP servers to register globally in ~/.claude.json.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/claude-code/claude-code' })
  .describe('Claude Code installation and configuration management');

export type ClaudeCodeConfig = z.infer<typeof schema>;

const defaultConfig: Partial<ClaudeCodeConfig> = {
  mcpServers: [],
};

const exampleSettings: ExampleConfig = {
  title: 'Claude Code with custom settings',
  description: 'Install Claude Code and configure model selection, editor mode, and shell permissions.',
  configs: [
    {
      type: 'claude-code',
      settings: {
        model: 'claude-opus-4-7',
        effortLevel: 'high',
        editorMode: 'vim',
        permissions: {
          allow: ['Bash(npm run *)', 'Bash(git *)'],
          deny: ['Bash(rm -rf *)'],
        },
      },
    },
  ],
};

const exampleWithMcp: ExampleConfig = {
  title: 'Claude Code with global instructions and MCP',
  description: 'Install Claude Code, set global instructions via CLAUDE.md, and wire up an MCP server.',
  configs: [
    {
      type: 'claude-code',
      globalClaudeMd:
        '# Global Instructions\n\nAlways follow security best practices.\nPrefer TypeScript over JavaScript.',
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

export class ClaudeCodeResource extends Resource<ClaudeCodeConfig> {
  getSettings(): ResourceSettings<ClaudeCodeConfig> {
    return {
      id: 'claude-code',
      defaultConfig,
      exampleConfigs: {
        example1: exampleSettings,
        example2: exampleWithMcp,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        globalClaudeMd: { canModify: true },
        settings: { type: 'stateful', definition: new SettingsParameter(), order: 1 },
        mcpServers: { type: 'stateful', definition: new McpServersParameter(), order: 2 },
      },
    };
  }

  async refresh(parameters: Partial<ClaudeCodeConfig>): Promise<Partial<ClaudeCodeConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('which claude');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    const result: Partial<ClaudeCodeConfig> = {};

    if (parameters.globalClaudeMd !== undefined) {
      try {
        result.globalClaudeMd = await fs.readFile(CLAUDE_MD_PATH, 'utf8');
      } catch {
        result.globalClaudeMd = undefined;
      }
    }

    return result;
  }

  async create(plan: CreatePlan<ClaudeCodeConfig>): Promise<void> {
    const $ = getPty();

    await $.spawn(
      'bash -c "curl -fsSL https://claude.ai/install.sh | bash"',
      { interactive: true },
    );

    // Ensure PATH is updated so subsequent lifecycle methods can call `claude`
    const localBin = path.join(os.homedir(), '.local', 'bin');
    process.env['PATH'] = `${localBin}:${process.env['PATH'] ?? ''}`;

    if (plan.desiredConfig.globalClaudeMd) {
      await this.writeClaudeMd(plan.desiredConfig.globalClaudeMd);
    }
  }

  async modify(
    pc: ParameterChange<ClaudeCodeConfig>,
    plan: ModifyPlan<ClaudeCodeConfig>,
  ): Promise<void> {
    if (pc.name === 'globalClaudeMd') {
      const newValue = plan.desiredConfig.globalClaudeMd;
      if (newValue) {
        await this.writeClaudeMd(newValue);
      } else {
        await fs.rm(CLAUDE_MD_PATH, { force: true });
      }
    }
  }

  async destroy(plan: DestroyPlan<ClaudeCodeConfig>): Promise<void> {
    const $ = getPty();

    if (plan.currentConfig.globalClaudeMd) {
      await fs.rm(CLAUDE_MD_PATH, { force: true });
    }

    // Attempt graceful uninstall via the CLI, fall back to binary removal
    const { status } = await $.spawnSafe('claude --uninstall --force');
    if (status !== SpawnStatus.SUCCESS) {
      const { data, status: whichStatus } = await $.spawnSafe('which claude');
      if (whichStatus === SpawnStatus.SUCCESS) {
        const binaryPath = data.trim();
        await fs.rm(binaryPath, { force: true });

        if (Utils.isLinux()) {
          // The install script may have created a systemd service
          await $.spawnSafe('systemctl stop claude-code', { requiresRoot: true });
          await $.spawnSafe('systemctl disable claude-code', { requiresRoot: true });
        }
      }
    }
  }

  private async writeClaudeMd(content: string): Promise<void> {
    await fs.mkdir(CLAUDE_DIR, { recursive: true });
    await fs.writeFile(CLAUDE_MD_PATH, content, 'utf8');
  }
}
