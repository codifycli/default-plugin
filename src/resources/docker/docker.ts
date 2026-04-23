import { CreatePlan, DestroyPlan, Resource, ResourceSettings, getPty, Utils, FileUtils } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SpawnStatus } from '../../utils/codify-spawn.js';
import Schema from './docker-schema.json';

export interface DockerConfig extends StringIndexedObject {
  acceptLicense?: boolean;
  useCurrentUser?: boolean;
}

const ARM_DOWNLOAD_LINK = 'https://desktop.docker.com/mac/main/arm64/Docker.dmg'
const INTEL_DOWNLOAD_LINK = 'https://desktop.docker.com/mac/main/amd64/Docker.dmg'

export class DockerResource extends Resource<DockerConfig> {
  getSettings(): ResourceSettings<DockerConfig> {
    return {
      id: 'docker',
      operatingSystems: [OS.Darwin],
      schema: Schema,
      parameterSettings: {
        acceptLicense: {
          type: 'boolean',
          setting: true,
          default: true,
        },
        // version: {
        //   type: 'version'
        // },
        useCurrentUser: {
          type: 'boolean',
          setting: true,
          default: true,
        }
      }
    };
  }

  async refresh(): Promise<Partial<DockerConfig> | Partial<DockerConfig>[] | null> {
    const $ = getPty();

    const versionResult = await $.spawnSafe('docker --version');
    if (versionResult.status === SpawnStatus.ERROR) {
      return null;
    }

    const result: DockerConfig = {};

    // TODO: support versioning in the future
    // const version = /Docker version (.*), build/.exec(versionResult.data)?.[1];
    // if (version && parameters.version) {
    //   result.version = version;
    // }

    return result;
  }

  /**
   * References:
   * Blog about docker changes: https://dazwallace.wordpress.com/2022/12/02/changes-to-docker-desktop-for-mac/
   * Path: https://stackoverflow.com/questions/64009138/docker-command-not-found-when-running-on-mac
   * Issue: https://github.com/docker/for-mac/issues/6504
   * @param plan
   */
  async create(plan: CreatePlan<DockerConfig>): Promise<void> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      const downloadLink = await Utils.isArmArch() ? ARM_DOWNLOAD_LINK : INTEL_DOWNLOAD_LINK;

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-docker'))
      await FileUtils.downloadFile(downloadLink, path.join(tmpDir, 'Docker.dmg'));
      const user = Utils.getUser();

      try {
        await $.spawn('hdiutil attach Docker.dmg', { cwd: tmpDir })

        console.log('Running Docker installer. This may take a couple of minutes to complete...')
        await $.spawn(`/Volumes/Docker/Docker.app/Contents/MacOS/install ${plan.desiredConfig.acceptLicense ? '--accept-license' : ''} ${plan.desiredConfig.useCurrentUser ? `--user ${user}` : ''}`,
          { requiresRoot: true }
        )

        // TODO: Attempt to sleep until Docker is ready
        await this.sleep(1000);
        await $.spawn('hdiutil detach /Volumes/Docker', { cwd: tmpDir })
      } finally {
        await fs.rm(tmpDir, { recursive: true, force: true })
      }

      await $.spawn('xattr -r -d com.apple.quarantine /Applications/Docker.app', { requiresRoot: true });
      await FileUtils.addPathToShellRc('/Applications/Docker.app/Contents/Resources/bin', true);
    } else if (Utils.isLinux()) {
      // Detect Linux distribution
      const isDebianBased = await this.isDebianBased($);
      const isRedHatBased = await this.isRedHatBased($);

      if (isDebianBased) {
        await this.installDockerDebian($);
      } else if (isRedHatBased) {
        await this.installDockerRedHat($);
      } else {
        throw new Error('Unsupported Linux distribution. Only Debian-based (Ubuntu, Debian) and RedHat-based (RHEL, CentOS, Fedora) systems are supported.');
      }
    } else {
      throw new Error('Unsupported operating system');
    }
  }

  async destroy(_plan: DestroyPlan<DockerConfig>): Promise<void> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      await $.spawnSafe('/Applications/Docker.app/Contents/MacOS/uninstall', { interactive: true, requiresRoot: true })
      await fs.rm(path.join(os.homedir(), 'Library/Group\\ Containers/group.com.docker'), { recursive: true, force: true });
      await fs.rm(path.join(os.homedir(), 'Library/Containers/com.docker.docker/Data'), { recursive: true, force: true });
      await fs.rm(path.join(os.homedir(), '.docker'), { recursive: true, force: true });
      await $.spawn('rm -rf /Applications/Docker.app')

      await FileUtils.removeLineFromShellRc('/Applications/Docker.app/Contents/Resources/bin')
    } else if (Utils.isLinux()) {
      const isDebianBased = await this.isDebianBased($);
      const isRedHatBased = await this.isRedHatBased($);

      if (isDebianBased) {
        await this.uninstallDockerDebian($);
      } else if (isRedHatBased) {
        await this.uninstallDockerRedHat($);
      } else {
        throw new Error('Unsupported Linux distribution. Only Debian-based (Ubuntu, Debian) and RedHat-based (RHEL, CentOS, Fedora) systems are supported.');
      }

      // Remove Docker data directories (common across all Linux distributions)
      await fs.rm(path.join(os.homedir(), '.docker'), { recursive: true, force: true });
    } else {
      throw new Error('Unsupported operating system');
    }
  }

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  private async isDebianBased($: ReturnType<typeof getPty>): Promise<boolean> {
    const result = await $.spawnSafe('test -f /etc/debian_version');
    return result.status === SpawnStatus.SUCCESS;
  }

  private async isRedHatBased($: ReturnType<typeof getPty>): Promise<boolean> {
    const result = await $.spawnSafe('test -f /etc/redhat-release');
    return result.status === SpawnStatus.SUCCESS;
  }

  private async installDockerDebian($: ReturnType<typeof getPty>): Promise<void> {
    console.log('Installing Docker on Debian-based system...');

    // Update package index
    await $.spawn('apt-get update', { requiresRoot: true });

    // Install prerequisites
    await $.spawn(
      'apt-get install -y ca-certificates curl gnupg lsb-release',
      { requiresRoot: true, env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' } }
    );

    // Add Docker's official GPG key
    await $.spawn(
      'install -m 0755 -d /etc/apt/keyrings',
      { requiresRoot: true }
    );
    await $.spawn(
      `bash -c 'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --batch --yes --dearmor -o /etc/apt/keyrings/docker.gpg'`,
      { requiresRoot: true }
    );
    await $.spawn(
      'chmod a+r /etc/apt/keyrings/docker.gpg',
      { requiresRoot: true }
    );

    // Set up the repository
    const archResult = await $.spawn('dpkg --print-architecture');
    const arch = archResult.data.trim();
    const distro = await this.getDebianDistro($);

    await $.spawn(
      `bash -c 'echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${distro} $(lsb_release -cs 2>/dev/null) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null'`,
      { requiresRoot: true }
    );

    // Install Docker Engine
    await $.spawn('apt-get update', { requiresRoot: true });
    await $.spawn(
      'apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      { requiresRoot: true, env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' } }
    );

    // Start and enable Docker service
    await $.spawn('systemctl start docker', { requiresRoot: true });
    await $.spawn('systemctl enable docker', { requiresRoot: true });

    console.log('Docker installed successfully on Debian-based system');
  }

  private async installDockerRedHat($: ReturnType<typeof getPty>): Promise<void> {
    console.log('Installing Docker on RedHat-based system...');

    // Install prerequisites
    await $.spawn(
      'yum install -y yum-utils',
      { requiresRoot: true }
    );

    // Add Docker repository
    await $.spawn(
      'yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo',
      { requiresRoot: true }
    );

    // Install Docker Engine
    await $.spawn(
      'yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      { requiresRoot: true }
    );

    // Start and enable Docker service
    await $.spawn('systemctl start docker', { requiresRoot: true });
    await $.spawn('systemctl enable docker', { requiresRoot: true });

    console.log('Docker installed successfully on RedHat-based system');
  }

  private async getDebianDistro($: ReturnType<typeof getPty>): Promise<string> {
    // Check if it's Ubuntu or Debian
    const result = await $.spawnSafe('lsb_release -is');
    if (result.status === SpawnStatus.SUCCESS) {
      const distro = result.data.trim().toLowerCase();
      if (distro === 'ubuntu') {
        return 'ubuntu';
      }

      if (distro === 'debian') {
        return 'debian';
      }
    }

    // Default to ubuntu if we can't determine
    return 'ubuntu';
  }

  private async uninstallDockerDebian($: ReturnType<typeof getPty>): Promise<void> {
    console.log('Uninstalling Docker from Debian-based system...');

    // Stop Docker service
    await $.spawnSafe('systemctl stop docker', { requiresRoot: true });
    await $.spawnSafe('systemctl stop docker.socket', { requiresRoot: true });

    // Remove Docker packages
    await $.spawn(
      'apt-get purge -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      { requiresRoot: true }
    );

    // Remove Docker repository and GPG key
    await $.spawnSafe('rm -f /etc/apt/sources.list.d/docker.list', { requiresRoot: true });
    await $.spawnSafe('rm -f /etc/apt/keyrings/docker.gpg', { requiresRoot: true });

    // Remove Docker data directories
    await $.spawnSafe('rm -rf /var/lib/docker', { requiresRoot: true });
    await $.spawnSafe('rm -rf /var/lib/containerd', { requiresRoot: true });

    // Clean up unused packages
    await $.spawnSafe('apt-get autoremove -y', { requiresRoot: true });

    console.log('Docker uninstalled successfully from Debian-based system');
  }

  private async uninstallDockerRedHat($: ReturnType<typeof getPty>): Promise<void> {
    console.log('Uninstalling Docker from RedHat-based system...');

    // Stop Docker service
    await $.spawnSafe('systemctl stop docker', { requiresRoot: true });
    await $.spawnSafe('systemctl stop docker.socket', { requiresRoot: true });

    // Remove Docker packages
    await $.spawn(
      'yum remove -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      { requiresRoot: true }
    );

    // Remove Docker repository
    await $.spawnSafe('rm -f /etc/yum.repos.d/docker-ce.repo', { requiresRoot: true });

    // Remove Docker data directories
    await $.spawnSafe('rm -rf /var/lib/docker', { requiresRoot: true });
    await $.spawnSafe('rm -rf /var/lib/containerd', { requiresRoot: true });

    console.log('Docker uninstalled successfully from RedHat-based system');
  }

}
