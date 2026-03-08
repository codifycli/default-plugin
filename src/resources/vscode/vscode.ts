import {
  CreatePlan,
  DestroyPlan,
  FileUtils,
  getPty,
  Resource,
  ResourceSettings,
  Utils
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpawnStatus } from '../../utils/codify-spawn.js';
import Schema from './vscode-schema.json';

const VSCODE_APPLICATION_NAME = 'Visual Studio Code.app';

const DOWNLOAD_URL = (platform: string) => `https://update.code.visualstudio.com/latest/${platform}/stable`;

export interface VscodeConfig extends ResourceConfig {
  directory: string;
}

export class VscodeResource extends Resource<VscodeConfig> {
  getSettings(): ResourceSettings<VscodeConfig> {
    return {
      id: 'vscode',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        directory: { type: 'directory', default: Utils.isMacOS() ? '/Applications' : path.join(os.homedir(), '.local', 'bin') }
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
      const location = path.join(directory, `"${VSCODE_APPLICATION_NAME}"`);
      await $.spawn(`rm -rf ${location}`);
    } else if (Utils.isLinux()) {

      if (Utils.isDebianBased()) {
        await $.spawnSafe('apt-get remove code -y', { requiresRoot: true });
      } else if (Utils.isRedhatBased()) {
        await $.spawnSafe('dnf remove code -y', { requiresRoot: true });
      } else {
        throw new Error('Unsupported Linux distribution. Only Debian-based (Ubuntu, Debian, Mint) and RedHat-based (RHEL, CentOS) systems are supported.');
      }

      // Remove user data and config
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
      // Check if code command exists in PATH
      const $ = getPty();
      const result = await $.spawnSafe('which code');
      return result.status === SpawnStatus.SUCCESS;
    }

    return false;
  }

  private async installMacOS(plan: CreatePlan<VscodeConfig>): Promise<void> {
    const $ = getPty();
    // Create a temporary tmp dir
    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-'));

    try {
      // Download vscode
      await $.spawn(`curl -H "user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36" -SL "${DOWNLOAD_URL('darwin-universal')}" -o vscode.zip`, { cwd: temporaryDir });
      await $.spawn('unzip -q vscode.zip', { cwd: temporaryDir });

      // Move VSCode to the applications folder
      const { directory } = plan.desiredConfig;
      await $.spawn(`mv "${VSCODE_APPLICATION_NAME}" ${directory}`, { cwd: temporaryDir });
    } finally {
      await $.spawn(`rm -rf ${temporaryDir}`);
    }
  }

  private async installLinux(_plan: CreatePlan<VscodeConfig>): Promise<void> {
    console.log('Installing VSCode on Linux...');

    const $ = getPty();

    // Detect distribution and architecture
    const isArm = await Utils.isArmArch();

    if (Utils.isDebianBased()) {
      const downloadLink = DOWNLOAD_URL(isArm ? 'linux-deb-arm64' : 'linux-deb-x64');
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vscode-'));
      const vscodeDebPath = path.join(tmpDir, 'vscode.deb');

      try {
        await FileUtils.downloadFile(downloadLink, vscodeDebPath);

        await $.spawn('debconf-set-selections <<< "code code/add-microsoft-repo boolean true"', { requiresRoot: true });
        await $.spawn('apt-get install ./vscode.deb -y', { cwd: tmpDir, requiresRoot: true, env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' } });
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
