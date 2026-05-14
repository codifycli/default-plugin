import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  FileUtils,
  Resource,
  ResourceSettings,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpawnStatus } from '../../utils/codify-spawn.js';
import { ExtensionsParameter } from './extensions-parameter.js';
import { SettingsParameter } from './settings-parameter.js';

const VSCODE_APPLICATION_NAME = 'Visual Studio Code.app';
const DOWNLOAD_URL = (platform: string) => `https://update.code.visualstudio.com/latest/${platform}/stable`;

function getVscodeBinDir(directory: string): string {
  return path.join(directory, VSCODE_APPLICATION_NAME, 'Contents', 'Resources', 'app', 'bin');
}

function getVscodePathExport(binDir: string): string {
  return `export PATH="${binDir}:$PATH"`;
}

const schema = z.object({
  directory: z
    .string()
    .describe('The directory to install VSCode into. Defaults to /Applications on macOS.')
    .optional(),
  extensions: z
    .array(z.string())
    .describe('VS Code extensions to install, e.g. ["ms-python.python", "eamodio.gitlens"].')
    .optional(),
  settings: z
    .record(z.string(), z.unknown())
    .describe('VS Code settings to merge into settings.json.')
    .optional(),
});

export type VscodeConfig = z.infer<typeof schema>;

const defaultConfig: Partial<VscodeConfig> = {
  extensions: [],
};

const examplePython: ExampleConfig = {
  title: 'Python development setup',
  description: 'Install VS Code with Python, Pylance, and GitLens extensions and common editor settings.',
  configs: [{
    type: 'vscode',
    extensions: ['ms-python.python', 'ms-python.vscode-pylance', 'eamodio.gitlens'],
    settings: { 'editor.fontSize': 14, 'editor.formatOnSave': true },
  }],
};

const exampleCustomEditor: ExampleConfig = {
  title: 'VS Code with custom editor settings',
  description: 'Install VS Code with Vim keybindings, GitHub Copilot, and a custom editor font.',
  configs: [{
    type: 'vscode',
    extensions: ['vscodevim.vim', 'github.copilot'],
    settings: {
      'editor.fontFamily': 'JetBrains Mono',
      'editor.fontSize': 15,
      'editor.tabSize': 2,
      'editor.formatOnSave': true,
    },
  }],
};

export class VscodeResource extends Resource<VscodeConfig> {
  getSettings(): ResourceSettings<VscodeConfig> {
    return {
      id: 'vscode',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: examplePython,
        example2: exampleCustomEditor,
      },
      parameterSettings: {
        directory: {
          type: 'directory',
          default: Utils.isMacOS() ? '/Applications' : path.join(os.homedir(), '.local', 'bin'),
        },
        extensions: { type: 'stateful', definition: new ExtensionsParameter(), order: 1 },
        settings: { type: 'stateful', definition: new SettingsParameter(), order: 2 },
      },
    };
  }

  override async refresh(parameters: Partial<VscodeConfig>): Promise<Partial<VscodeConfig> | null> {
    const directory = parameters.directory!;
    const isInstalled = await this.isVscodeInstalled(directory);
    if (!isInstalled) {
      return null;
    }
    return parameters;
  }

  override async create(plan: CreatePlan<VscodeConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await this.installMacOS(plan);
    } else if (Utils.isLinux()) {
      await this.installLinux(plan);
    } else {
      throw new Error('Unsupported operating system');
    }
  }

  override async destroy(plan: DestroyPlan<VscodeConfig>): Promise<void> {
    const $ = getPty();
    const { directory } = plan.currentConfig;

    if (Utils.isMacOS()) {
      const binDir = getVscodeBinDir(directory!);
      await FileUtils.removeLineFromShellRc(getVscodePathExport(binDir));

      const location = path.join(directory!, `"${VSCODE_APPLICATION_NAME}"`);
      await $.spawn(`rm -rf ${location}`);
    } else if (Utils.isLinux()) {
      if (Utils.isDebianBased()) {
        await $.spawnSafe('apt-get remove code -y', { requiresRoot: true });
      } else if (Utils.isRedhatBased()) {
        await $.spawnSafe('dnf remove code -y', { requiresRoot: true });
      } else {
        throw new Error('Unsupported Linux distribution. Only Debian-based (Ubuntu, Debian, Mint) and RedHat-based (RHEL, CentOS) systems are supported.');
      }

      await $.spawnSafe(`rm -rf ${path.join(os.homedir(), '.config/Code')}`);
      await $.spawnSafe(`rm -rf ${path.join(os.homedir(), '.vscode')}`);
    } else {
      throw new Error('Unsupported operating system');
    }
  }

  private async isVscodeInstalled(directory: string): Promise<boolean> {
    if (Utils.isMacOS()) {
      try {
        const files = await fs.readdir(directory);
        return files.includes(VSCODE_APPLICATION_NAME);
      } catch {
        return false;
      }
    }

    if (Utils.isLinux()) {
      const $ = getPty();
      const result = await $.spawnSafe('which code');
      return result.status === SpawnStatus.SUCCESS;
    }

    return false;
  }

  private async installMacOS(plan: CreatePlan<VscodeConfig>): Promise<void> {
    const $ = getPty();
    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-'));

    try {
      await $.spawn(`curl -H "user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36" -SL "${DOWNLOAD_URL('darwin-universal')}" -o vscode.zip`, { cwd: temporaryDir });
      await $.spawn('unzip -q vscode.zip', { cwd: temporaryDir });

      const { directory } = plan.desiredConfig;
      await $.spawn(`mv "${VSCODE_APPLICATION_NAME}" ${directory}`, { cwd: temporaryDir });
    } finally {
      await $.spawn(`rm -rf ${temporaryDir}`);
    }

    // Add the VS Code CLI bin dir to PATH in the shell RC so `code` is available in new terminals.
    // See: https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line
    const binDir = getVscodeBinDir(plan.desiredConfig.directory!);
    await FileUtils.addToShellRc(getVscodePathExport(binDir));
  }

  private async installLinux(_plan: CreatePlan<VscodeConfig>): Promise<void> {
    const $ = getPty();
    const isArm = await Utils.isArmArch();

    if (Utils.isDebianBased()) {
      const downloadLink = DOWNLOAD_URL(isArm ? 'linux-deb-arm64' : 'linux-deb-x64');
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-'));
      const vscodeDebPath = path.join(tmpDir, 'vscode.deb');

      try {
        await FileUtils.downloadFile(downloadLink, vscodeDebPath);
        await $.spawn('apt-get update -y', { requiresRoot: true, env: { DEBIAN_FRONTEND: 'noninteractive' } });
        await $.spawn('debconf-set-selections <<< "code code/add-microsoft-repo boolean true"', { requiresRoot: true });
        await $.spawn('apt-get install ./vscode.deb -y --fix-missing', { cwd: tmpDir, requiresRoot: true, env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' } });
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
      }

      return;
    }

    if (Utils.isRedhatBased()) {
      await $.spawn('rpm --import https://packages.microsoft.com/keys/microsoft.asc &&\n' +
        'echo -e "[code]\\nname=Visual Studio Code\\nbaseurl=https://packages.microsoft.com/yumrepos/vscode\\nenabled=1\\nautorefresh=1\\ntype=rpm-md\\ngpgcheck=1\\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc" | tee /etc/yum.repos.d/vscode.repo > /dev/null', { requiresRoot: true });
      await $.spawn('dnf check-update && dnf install code -y', { requiresRoot: true, env: { DEBIAN_FRONTEND: 'noninteractive' } });
      return;
    }

    throw new Error('Unsupported Linux distribution. Only Debian-based (Ubuntu, Debian, Mint) and RedHat-based (RHEL, CentOS) systems are supported.');
  }

}
