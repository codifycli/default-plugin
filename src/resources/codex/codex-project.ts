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
import { CodexConfigParameter } from './config-parameter.js';
import { codexMcpServerSchema } from './mcp-server-schema.js';
import { CodexMcpServersParameter } from './mcp-servers-parameter.js';

const schema = z
  .object({
    directory: z
      .string()
      .describe(
        'Path to the project directory. AGENTS.md is written at <directory>/AGENTS.md and ' +
        'per-project settings/MCP servers are written under <directory>/.codex/config.toml.',
      ),
    agentsMd: z
      .string()
      .optional()
      .describe(
        'Content for <directory>/AGENTS.md. Accepts inline text, an https:// URL, or a ' +
        'codify:// cloud URL (e.g. codify://documentId:fileId). Codex reads this file for ' +
        'project-specific instructions.',
      ),
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Settings to merge into <directory>/.codex/config.toml. Supports the same keys as the ' +
        'global config, e.g. model, approval_policy, sandbox_mode, sandbox_workspace_write.',
      ),
    mcpServers: z
      .array(codexMcpServerSchema)
      .optional()
      .describe('MCP servers to register for this project under [mcp_servers] in <directory>/.codex/config.toml.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/codex/codex-project' })
  .describe('Per-project Codex configuration');

export type CodexProjectConfig = z.infer<typeof schema>;

const defaultConfig: Partial<CodexProjectConfig> = {
  mcpServers: [],
};

const examplePerProject: ExampleConfig = {
  title: 'Per-project AGENTS.md and settings',
  description: 'Add project-specific AGENTS.md instructions and a sandbox policy for a single repository.',
  configs: [
    {
      type: 'codex-project',
      directory: '~/projects/my-api',
      agentsMd: '# Project Instructions\n\nThis is a Node.js API. Always use async/await.\nRun `npm test` before committing.',
      config: {
        sandbox_mode: 'workspace-write',
        approval_policy: 'on-request',
      },
    },
  ],
};

const exampleWithMcp: ExampleConfig = {
  title: 'Per-project AGENTS.md with MCP server',
  description: 'Configure per-project AGENTS.md and a project-scoped MCP server for database access.',
  configs: [
    {
      type: 'codex-project',
      directory: '~/projects/my-api',
      agentsMd: '# Project Instructions\n\nAlways check types with `npm run typecheck` before submitting.',
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

function resolveCodexDir(directory: string): string {
  return path.join(untildify(directory), '.codex');
}

function resolveAgentsMdPath(directory: string): string {
  return path.join(untildify(directory), 'AGENTS.md');
}

export class CodexProjectResource extends Resource<CodexProjectConfig> {
  getSettings(): ResourceSettings<CodexProjectConfig> {
    return {
      id: 'codex-project',
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: examplePerProject,
        example2: exampleWithMcp,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: ['codex'],
      parameterSettings: {
        directory: { type: 'directory', canModify: false },
        agentsMd: { canModify: true },
        config: { type: 'stateful', definition: new CodexConfigParameter(), order: 1 },
        mcpServers: { type: 'stateful', definition: new CodexMcpServersParameter(), order: 2 },
      },
      allowMultiple: {
        identifyingParameters: ['directory'],
      },
      removeStatefulParametersBeforeDestroy: true,
    };
  }

  async refresh(parameters: Partial<CodexProjectConfig>): Promise<Partial<CodexProjectConfig> | null> {
    if (!parameters.directory) {
      return null;
    }

    // Use the .codex dir as the existence marker. Return null (not installed) if it doesn't exist.
    try {
      await fs.access(resolveCodexDir(parameters.directory));
    } catch {
      return null;
    }

    // Start from parameters so identifying fields (directory) are present in the result,
    // preventing the framework from re-planning a CREATE on every validation pass.
    const result: Partial<CodexProjectConfig> = { ...parameters };

    if (parameters.agentsMd != null) {
      if (isRemoteUrl(parameters.agentsMd)) {
        // For remote URLs, keep the URL as-is so the framework compares URL vs URL.
        // Change detection for remote content is done via hash on apply.
        result.agentsMd = parameters.agentsMd;
      } else {
        try {
          result.agentsMd = await fs.readFile(resolveAgentsMdPath(parameters.directory), 'utf8');
        } catch {
          result.agentsMd = undefined;
        }
      }
    }

    return result;
  }

  async create(plan: CreatePlan<CodexProjectConfig>): Promise<void> {
    const { directory, agentsMd } = plan.desiredConfig;
    if (directory) {
      await fs.mkdir(resolveCodexDir(directory), { recursive: true });
    }
    if (agentsMd && directory) {
      await this.writeAgentsMd(agentsMd, directory);
    }
  }

  async modify(
    pc: ParameterChange<CodexProjectConfig>,
    plan: ModifyPlan<CodexProjectConfig>,
  ): Promise<void> {
    if (pc.name === 'agentsMd') {
      const { directory, agentsMd } = plan.desiredConfig;
      if (agentsMd && directory) {
        await this.writeAgentsMd(agentsMd, directory);
      } else if (directory) {
        await fs.rm(resolveAgentsMdPath(directory), { force: true });
      }
    }
  }

  async destroy(plan: DestroyPlan<CodexProjectConfig>): Promise<void> {
    const { directory } = plan.currentConfig;
    if (!directory) return;

    await fs.rm(resolveAgentsMdPath(directory), { force: true });
    await fs.rm(resolveCodexDir(directory), { recursive: true, force: true });
  }

  private async writeAgentsMd(content: string, directory: string): Promise<void> {
    const resolved = await resolveAgentsMdContent(content);
    await fs.mkdir(untildify(directory), { recursive: true });
    await fs.writeFile(resolveAgentsMdPath(directory), resolved, 'utf8');
  }
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://') || value.startsWith('codify://');
}

async function resolveAgentsMdContent(content: string): Promise<string> {
  if (content.startsWith('codify://')) {
    const regex = /codify:\/\/(.*):(.*)/;
    const [, documentId, fileId] = regex.exec(content) ?? [];
    if (!documentId || !fileId) {
      throw new Error(`Invalid codify URL for agentsMd: ${content}`);
    }
    const credentials = await CodifyCliSender.getCodifyCliCredentials();
    const response = await fetch(`https://api.codifycli.com/v1/documents/${documentId}/file/${fileId}`, {
      headers: { Authorization: `Bearer ${credentials}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch agentsMd from ${content}: ${response.statusText}`);
    }
    return response.text();
  }

  if (content.startsWith('https://') || content.startsWith('http://')) {
    const response = await fetch(content);
    if (!response.ok) {
      throw new Error(`Failed to fetch agentsMd from ${content}: ${response.statusText}`);
    }
    return response.text();
  }

  return content;
}
