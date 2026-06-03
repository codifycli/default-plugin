import {
  CodifyCliSender,
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { untildify } from '../../utils/untildify.js';
import { McpServersParameter } from './mcp-servers-parameter.js';
import { SettingsParameter } from './settings-parameter.js';
import { mcpServerSchema } from './claude-code.js';

const schema = z
  .object({
    directory: z
      .string()
      .describe(
        'Path to the project directory. All configuration is written under <directory>/.claude/ ' +
        'and <directory>/.claude.json.',
      ),
    claudeMd: z
      .string()
      .optional()
      .describe(
        'Content for <directory>/.claude/CLAUDE.md. Accepts inline text, an https:// URL, ' +
        'or a codify:// cloud URL (e.g. codify://documentId:fileId).',
      ),
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Settings to merge into <directory>/.claude/settings.json. Supports the same keys as the ' +
        'global settings: model, effortLevel, editorMode, permissions, env, hooks, etc.',
      ),
    mcpServers: z
      .array(mcpServerSchema)
      .optional()
      .describe('MCP servers to register for this project in <directory>/.claude.json.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/claude-code/claude-code-project' })
  .describe('Per-project Claude Code configuration');

export type ClaudeCodeProjectConfig = z.infer<typeof schema>;

const defaultConfig: Partial<ClaudeCodeProjectConfig> = {
  mcpServers: [],
};

const examplePerProject: ExampleConfig = {
  title: 'Per-project instructions and settings',
  description: 'Add project-specific CLAUDE.md instructions and scoped tool permissions for a single repository.',
  configs: [
    {
      type: 'claude-code-project',
      directory: '~/projects/my-api',
      claudeMd: '# Project Instructions\n\nThis is a Node.js API. Always use async/await.\nRun `npm test` before committing.',
      settings: {
        permissions: {
          allow: ['Bash(npm run *)', 'Bash(git *)'],
          deny: ['Bash(rm -rf *)'],
        },
      },
    },
  ],
};

const exampleWithMcp: ExampleConfig = {
  title: 'Per-project instructions with MCP server',
  description: 'Configure per-project CLAUDE.md and a project-scoped MCP server for database access.',
  configs: [
    {
      type: 'claude-code-project',
      directory: '~/projects/my-api',
      claudeMd: '# Project Instructions\n\nAlways check types with `npm run typecheck` before submitting.',
      mcpServers: [
        {
          name: 'project-db',
          type: 'stdio',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
        },
      ],
    },
  ],
};

function resolveClaudeDir(directory: string): string {
  return path.join(untildify(directory), '.claude');
}

function resolveClaudeMdPath(directory: string): string {
  return path.join(resolveClaudeDir(directory), 'CLAUDE.md');
}

export class ClaudeCodeProjectResource extends Resource<ClaudeCodeProjectConfig> {
  getSettings(): ResourceSettings<ClaudeCodeProjectConfig> {
    return {
      id: 'claude-code-project',
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: examplePerProject,
        example2: exampleWithMcp,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: ['claude-code'],
      parameterSettings: {
        directory: { type: 'directory', canModify: false },
        claudeMd: { canModify: true },
        settings: { type: 'stateful', definition: new SettingsParameter(), order: 1 },
        mcpServers: { type: 'stateful', definition: new McpServersParameter(), order: 2 },
      },
      allowMultiple: {
        identifyingParameters: ['directory'],
      },
      removeStatefulParametersBeforeDestroy: true,
    };
  }

  async refresh(parameters: Partial<ClaudeCodeProjectConfig>): Promise<Partial<ClaudeCodeProjectConfig> | null> {
    if (!parameters.directory) {
      return null;
    }

    // Use the .claude dir as the existence marker. Return null (not installed) if it doesn't exist.
    try {
      await fs.access(resolveClaudeDir(parameters.directory));
    } catch {
      return null;
    }

    // Start from parameters so identifying fields (directory) are present in the result,
    // preventing the framework from re-planning a CREATE on every validation pass.
    const result: Partial<ClaudeCodeProjectConfig> = { ...parameters };

    if (parameters.claudeMd !== undefined) {
      if (isRemoteUrl(parameters.claudeMd)) {
        // For remote URLs, keep the URL as-is so the framework compares URL vs URL.
        // Change detection for remote content is done via hash on apply.
        result.claudeMd = parameters.claudeMd;
      } else {
        try {
          result.claudeMd = await fs.readFile(resolveClaudeMdPath(parameters.directory), 'utf8');
        } catch {
          result.claudeMd = undefined;
        }
      }
    }

    return result;
  }

  async create(plan: CreatePlan<ClaudeCodeProjectConfig>): Promise<void> {
    const { directory, claudeMd } = plan.desiredConfig;
    if (directory) {
      await fs.mkdir(resolveClaudeDir(directory), { recursive: true });
    }
    if (claudeMd && directory) {
      await this.writeClaudeMd(claudeMd, directory);
    }
  }

  async modify(
    pc: ParameterChange<ClaudeCodeProjectConfig>,
    plan: ModifyPlan<ClaudeCodeProjectConfig>,
  ): Promise<void> {
    if (pc.name === 'claudeMd') {
      const { directory, claudeMd } = plan.desiredConfig;
      if (claudeMd && directory) {
        await this.writeClaudeMd(claudeMd, directory);
      } else if (directory) {
        await fs.rm(resolveClaudeMdPath(directory), { force: true });
      }
    }
  }

  async destroy(plan: DestroyPlan<ClaudeCodeProjectConfig>): Promise<void> {
    const { directory } = plan.currentConfig;
    if (!directory) return;

    await fs.rm(resolveClaudeMdPath(directory), { force: true });
    await fs.rm(resolveClaudeDir(directory), { recursive: true, force: true });
  }

  private async writeClaudeMd(content: string, directory: string): Promise<void> {
    const claudeDir = resolveClaudeDir(directory);
    await fs.mkdir(claudeDir, { recursive: true });
    const resolved = await resolveClaudeMdContent(content);
    await fs.writeFile(resolveClaudeMdPath(directory), resolved, 'utf8');
  }
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://') || value.startsWith('codify://');
}

async function resolveClaudeMdContent(content: string): Promise<string> {
  if (content.startsWith('codify://')) {
    const regex = /codify:\/\/(.*):(.*)/;
    const [, documentId, fileId] = regex.exec(content) ?? [];
    if (!documentId || !fileId) {
      throw new Error(`Invalid codify URL for claudeMd: ${content}`);
    }
    const credentials = await CodifyCliSender.getCodifyCliCredentials();
    const response = await fetch(`https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}`, {
      headers: { Authorization: `Bearer ${credentials}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch claudeMd from ${content}: ${response.statusText}`);
    }
    return response.text();
  }

  if (content.startsWith('https://') || content.startsWith('http://')) {
    const response = await fetch(content);
    if (!response.ok) {
      throw new Error(`Failed to fetch claudeMd from ${content}: ${response.statusText}`);
    }
    return response.text();
  }

  return content;
}
