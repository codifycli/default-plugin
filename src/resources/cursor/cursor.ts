import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  FileUtils,
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

import { ExtensionsParameter } from './extensions-parameter.js';
import { McpServersParameter } from './mcp-servers-parameter.js';
import { SettingsParameter } from './settings-parameter.js';

export const CURSOR_APPLICATION_NAME = 'Cursor.app';
export const CURSOR_LOCAL_BIN = path.join(os.homedir(), '.local', 'bin');
const CURSOR_LOCAL_BIN_EXPORT = `export PATH="${CURSOR_LOCAL_BIN}:$PATH"`;

export const mcpServerSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().optional(),
});
export type McpServer = z.infer<typeof mcpServerSchema>;
export type McpServers = Record<string, McpServer>;

const schema = z.object({
  directory: z
    .string()
    .describe('Installation directory. Defaults to /Applications on macOS, ~/.local/bin on Linux.')
    .optional(),
  extensions: z
    .array(z.string())
    .describe('Cursor extensions to install, e.g. ["ms-python.python", "eamodio.gitlens"].')
    .optional(),
  settings: z
    .record(z.string(), z.unknown())
    .describe('Cursor editor settings to merge into settings.json.')
    .optional(),
  mcpServers: z
    .record(z.string(), mcpServerSchema)
    .describe('MCP servers to configure in ~/.cursor/mcp.json.')
    .optional(),
});

export type CursorConfig = z.infer<typeof schema>;

const defaultConfig: Partial<CursorConfig> = {
  extensions: [],
};

const exampleAi: ExampleConfig = {
  title: 'AI-powered development setup',
  description: 'Install Cursor with popular development extensions and editor settings for productive AI-assisted coding.',
  configs: [{
    type: 'cursor',
    extensions: ['ms-python.python', 'eamodio.gitlens', 'esbenp.prettier-vscode'],
    settings: {
      'editor.fontSize': 14,
      'editor.formatOnSave': true,
      'editor.tabSize': 2,
    },
  }],
};

const exampleWithMcp: ExampleConfig = {
  title: 'Cursor with MCP servers',
  description: 'Configure Cursor with MCP servers for extended AI capabilities including filesystem and GitHub access.',
  configs: [{
    type: 'cursor',
    extensions: ['ms-python.python', 'eamodio.gitlens'],
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/projects'],
      },
      github: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: '<Replace me here!' },
      },
    },
  }],
};

export class CursorResource extends Resource<CursorConfig> {
  getSettings(): ResourceSettings<CursorConfig> {
    return {
      id: 'cursor',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: exampleAi,
        example2: exampleWithMcp,
      },
      parameterSettings: {
        directory: {
          type: 'directory',
          default: Utils.isMacOS() ? '/Applications' : CURSOR_LOCAL_BIN,
        },
        extensions: { type: 'stateful', definition: new ExtensionsParameter(), order: 1 },
        settings: { type: 'stateful', definition: new SettingsParameter(), order: 2 },
        mcpServers: { type: 'stateful', definition: new McpServersParameter(), order: 3 },
      },
    };
  }

  override async refresh(parameters: Partial<CursorConfig>): Promise<Partial<CursorConfig> | null> {
    const isInstalled = await this.isCursorInstalled(parameters.directory);
    return isInstalled ? parameters : null;
  }

  override async create(plan: CreatePlan<CursorConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await this.installMacOS();
    } else if (Utils.isLinux()) {
      await this.installLinux(plan);
    } else {
      throw new Error('Unsupported operating system');
    }
  }

  override async destroy(plan: DestroyPlan<CursorConfig>): Promise<void> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      const directory = plan.currentConfig.directory ?? '/Applications';
      await $.spawn(`rm -rf "${path.join(directory, CURSOR_APPLICATION_NAME)}"`);
    } else if (Utils.isLinux()) {
      const aptCheck = await $.spawnSafe('which apt-get');
      const dnfCheck = await $.spawnSafe('which dnf');
      const yumCheck = await $.spawnSafe('which yum');
      if (aptCheck.status === SpawnStatus.SUCCESS || dnfCheck.status === SpawnStatus.SUCCESS || yumCheck.status === SpawnStatus.SUCCESS) {
        await Utils.uninstallViaPkgMgr('cursor');
      } else {
        const directory = plan.currentConfig.directory ?? CURSOR_LOCAL_BIN;
        await $.spawnSafe(`rm -f "${path.join(directory, 'cursor')}"`);
        await FileUtils.removeLineFromShellRc(CURSOR_LOCAL_BIN_EXPORT);
      }
    }
  }

  private async isCursorInstalled(directory?: string | null): Promise<boolean> {
    if (Utils.isMacOS()) {
      try {
        const files = await fs.readdir(directory ?? '/Applications');
        return files.includes(CURSOR_APPLICATION_NAME);
      } catch {
        return false;
      }
    }

    if (Utils.isLinux()) {
      const $ = getPty();
      const result = await $.spawnSafe('which cursor');
      return result.status === SpawnStatus.SUCCESS;
    }

    return false;
  }

  private async installMacOS(): Promise<void> {
    const $ = getPty();
    await $.spawn('brew install --cask cursor', { interactive: true });
  }

  private async installLinux(plan: CreatePlan<CursorConfig>): Promise<void> {
    const $ = getPty();

    const aptCheck = await $.spawnSafe('which apt-get');
    if (aptCheck.status === SpawnStatus.SUCCESS) {
      await $.spawn(
        'bash -c "curl -fsSL https://downloads.cursor.com/keys/anysphere.asc | gpg --dearmor | tee /etc/apt/keyrings/cursor.gpg > /dev/null"',
        { requiresRoot: true },
      );
      await $.spawn(
        'bash -c "echo \\"deb [arch=amd64,arm64 signed-by=/etc/apt/keyrings/cursor.gpg] https://downloads.cursor.com/aptrepo stable main\\" | tee /etc/apt/sources.list.d/cursor.list > /dev/null"',
        { requiresRoot: true },
      );
      await Utils.installViaPkgMgr('cursor');
      return;
    }

    const dnfCheck = await $.spawnSafe('which dnf');
    const yumCheck = await $.spawnSafe('which yum');
    if (dnfCheck.status === SpawnStatus.SUCCESS || yumCheck.status === SpawnStatus.SUCCESS) {
      const pkgMgr = dnfCheck.status === SpawnStatus.SUCCESS ? 'dnf' : 'yum';
      await $.spawn(
        `${pkgMgr} config-manager --add-repo https://downloads.cursor.com/yumrepo/cursor.repo`,
        { requiresRoot: true },
      );
      await Utils.installViaPkgMgr('cursor');
      return;
    }

    // Fallback: AppImage
    const isArm = await Utils.isArmArch();
    const downloadUrl = `https://api2.cursor.sh/updates/download/golden/linux-${isArm ? 'arm64' : 'x64'}/cursor/latest`;
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-'));
    const tmpAppImage = path.join(tmpDir, 'cursor.AppImage');

    try {
      await FileUtils.downloadFile(downloadUrl, tmpAppImage);
      const destDir = plan.desiredConfig.directory ?? CURSOR_LOCAL_BIN;
      await fs.mkdir(destDir, { recursive: true });
      const destPath = path.join(destDir, 'cursor');
      await fs.rename(tmpAppImage, destPath);
      await $.spawn(`chmod +x "${destPath}"`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    await FileUtils.addToShellRc(CURSOR_LOCAL_BIN_EXPORT);
  }
}
