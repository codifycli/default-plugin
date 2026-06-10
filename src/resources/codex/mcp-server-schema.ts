import { z } from '@codifycli/plugin-core';

const codexMcpStdioServerSchema = z.object({
  name: z.string().describe('Unique name for this MCP server'),
  type: z.literal('stdio'),
  command: z.string().describe('Executable or command used to launch the MCP server process'),
  args: z.array(z.string()).optional().describe('Arguments passed to the command'),
  env: z.record(z.string(), z.string()).optional().describe('Static environment variables passed to the server process'),
  envVars: z.array(z.string()).optional().describe('Names of environment variables forwarded from the Codex process environment'),
  cwd: z.string().optional().describe('Working directory for the server process'),
  startupTimeoutSec: z.number().optional().describe('Seconds to wait for the server to start (default: 10)'),
  toolTimeoutSec: z.number().optional().describe('Seconds to wait for tool calls to complete (default: 60)'),
});

const codexMcpHttpServerSchema = z.object({
  name: z.string().describe('Unique name for this MCP server'),
  type: z.literal('http'),
  url: z.string().describe('URL of the streamable-HTTP MCP server'),
  bearerTokenEnvVar: z.string().optional().describe('Name of the environment variable that holds the bearer token'),
  httpHeaders: z.record(z.string(), z.string()).optional().describe('Static HTTP headers sent with every request'),
});

export const codexMcpServerSchema = z.discriminatedUnion('type', [
  codexMcpStdioServerSchema,
  codexMcpHttpServerSchema,
]);

export type CodexMcpServer = z.infer<typeof codexMcpServerSchema>;

/**
 * Converts a CodexMcpServer (camelCase) into the TOML table shape expected under
 * [mcp_servers.<name>] in ~/.codex/config.toml (snake_case keys).
 */
export function mcpServerToToml(server: CodexMcpServer): Record<string, unknown> {
  const toml: Record<string, unknown> = {};

  if (server.type === 'stdio') {
    toml['command'] = server.command;
    if (server.args !== undefined) toml['args'] = server.args;
    if (server.env !== undefined) toml['env'] = server.env;
    if (server.envVars !== undefined) toml['env_vars'] = server.envVars;
    if (server.cwd !== undefined) toml['cwd'] = server.cwd;
    if (server.startupTimeoutSec !== undefined) toml['startup_timeout_sec'] = server.startupTimeoutSec;
    if (server.toolTimeoutSec !== undefined) toml['tool_timeout_sec'] = server.toolTimeoutSec;
  } else {
    toml['url'] = server.url;
    if (server.bearerTokenEnvVar !== undefined) toml['bearer_token_env_var'] = server.bearerTokenEnvVar;
    if (server.httpHeaders !== undefined) toml['http_headers'] = server.httpHeaders;
  }

  return toml;
}

/**
 * Converts a [mcp_servers.<name>] TOML table back into a CodexMcpServer (camelCase).
 */
export function tomlToMcpServer(name: string, toml: Record<string, unknown>): CodexMcpServer {
  if (typeof toml['command'] === 'string') {
    return {
      name,
      type: 'stdio',
      command: toml['command'] as string,
      ...(toml['args'] !== undefined ? { args: toml['args'] as string[] } : {}),
      ...(toml['env'] !== undefined ? { env: toml['env'] as Record<string, string> } : {}),
      ...(toml['env_vars'] !== undefined ? { envVars: toml['env_vars'] as string[] } : {}),
      ...(toml['cwd'] !== undefined ? { cwd: toml['cwd'] as string } : {}),
      ...(toml['startup_timeout_sec'] !== undefined ? { startupTimeoutSec: toml['startup_timeout_sec'] as number } : {}),
      ...(toml['tool_timeout_sec'] !== undefined ? { toolTimeoutSec: toml['tool_timeout_sec'] as number } : {}),
    };
  }

  return {
    name,
    type: 'http',
    url: toml['url'] as string,
    ...(toml['bearer_token_env_var'] !== undefined ? { bearerTokenEnvVar: toml['bearer_token_env_var'] as string } : {}),
    ...(toml['http_headers'] !== undefined ? { httpHeaders: toml['http_headers'] as Record<string, string> } : {}),
  };
}
