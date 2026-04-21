import {
  CreatePlan,
  ExampleConfig,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  Utils, FileUtils
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';

import Schema from './terraform-schema.json';
import { HashicorpReleaseInfo, HashicorpReleasesAPIResponse, TerraformVersionInfo } from './terraform-types.js';
import { codifySpawn } from '../../utils/codify-spawn.js';

const TERRAFORM_RELEASES_API_URL = 'https://api.releases.hashicorp.com/v1/releases/terraform';
const TERRAFORM_RELEASE_INFO_API_URL = (version: string) => `https://api.releases.hashicorp.com/v1/releases/terraform/${version}`;

export interface TerraformConfig extends StringIndexedObject {
  directory?: string,
  version?: string,
  // TODO: Add option to install using brew.
  // TODO: Add option to install auto-complete
}

const defaultConfig: Partial<TerraformConfig> = {
  version: 'latest',
}

const exampleLatest: ExampleConfig = {
  title: 'Install Terraform at a pinned version',
  description: 'Install a specific version of Terraform to ensure reproducible infrastructure deployments across machines.',
  configs: [{
    type: 'terraform',
    version: '1.10.5',
  }]
}

const exampleCustomDir: ExampleConfig = {
  title: 'Install a pinned Terraform version to a custom directory',
  description: 'Install a specific Terraform version to a user-owned directory, avoiding the need for root permissions.',
  configs: [{
    type: 'terraform',
    version: '1.10.5',
    directory: '~/.local/bin',
  }]
}

export class TerraformResource extends Resource<TerraformConfig> {

  getSettings(): ResourceSettings<TerraformConfig> {
    return {
      id: 'terraform',
      defaultConfig,
      exampleConfigs: {
        example1: exampleLatest,
        example2: exampleCustomDir,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        directory: {
          type: 'directory',
        }
      },
      importAndDestroy:{
        refreshKeys: ['directory', 'version'],
        defaultRefreshValues: {
          version: 'latest',
        }
      }
    }
  }

  override async refresh(parameters: Partial<TerraformConfig>): Promise<Partial<TerraformConfig> | null> {
    const $ = getPty();

    const terraformInfo = await $.spawnSafe('which terraform');
    if (terraformInfo.status === SpawnStatus.ERROR) {
      return null;
    }

    const results: Partial<TerraformConfig> = {}
    if (parameters.directory) {
      const directory = terraformInfo.data.trim();

      // which command returns the directory with the binary included. For Ex: /usr/local/bin/terraform. Remove the terraform and return.
      results.directory = directory.slice(0, Math.max(0, directory.lastIndexOf('/')));
    }

    if (parameters.version) {
      const versionQuery = await $.spawn('terraform version -json');
      const versionJson = JSON.parse(versionQuery.data.trim().replaceAll('\n', '')) as TerraformVersionInfo;

      results.version = versionJson.terraform_version;
    }

    return results;
  }

  override async create(plan: CreatePlan<TerraformConfig>): Promise<void> {
    const { version } = plan.desiredConfig;
    const isArm = await Utils.isArmArch()
    const directory = plan.desiredConfig.directory ?? '/usr/local/bin';
    const $ = getPty();

    const releaseInfo = await (version ? this.getReleaseInfo(version) : this.getLatestTerraformInfo());
    if (!releaseInfo) {
      throw new Error(`Resource ${this.getSettings().id} unable to resolve Terraform download url ${version}`);
    }

    const downloadUrl = await this.getDownloadUrl(releaseInfo, isArm);
    if (!downloadUrl) {
      throw new Error(`Resource ${this.getSettings().id}. Could not parse download url for arch ${isArm ? 'arm64' : 'amd64'}, os: darwin, and version: ${version}. 
${JSON.stringify(releaseInfo, null, 2)}
      `);
    }
    
    // Create a temporary tmp dir
    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'terraform-'));

    // Ensure curl and unzip are available (not installed by default on some Linux distros)
    const curlCheck = await $.spawnSafe('which curl');
    if (curlCheck.status === SpawnStatus.ERROR) {
      await Utils.installViaPkgMgr('curl');
    }

    const unzipCheck = await $.spawnSafe('which unzip');
    if (unzipCheck.status === SpawnStatus.ERROR) {
      await Utils.installViaPkgMgr('unzip');
    }

    // Download and unzip the terraform binary
    await $.spawn(`curl -fsSL ${downloadUrl} -o terraform.zip`, { cwd: temporaryDir });
    await $.spawn('unzip -q terraform.zip', { cwd: temporaryDir });

    // Ensure that /usr/local/bin exists. If not then create it
    await (directory === '/usr/local/bin' ? this.createBinDirectoryIfNotExists() : this.createDirectoryIfNotExists(directory));

    await $.spawn(`mv ./terraform ${directory}`, { cwd: temporaryDir, requiresRoot: true })
    await $.spawn(`rm -rf ${temporaryDir}`)

    if (!(await Utils.isDirectoryOnPath(directory))) {
      await FileUtils.addToShellRc(`export PATH=$PATH:${directory}`);
    }
  }

  override async destroy(): Promise<void> {
    const $ = getPty();
    const installLocationQuery = await $.spawnSafe('which terraform', { interactive: true });
    console.log('Right after which terraform', installLocationQuery.data);
    if (installLocationQuery.status === SpawnStatus.ERROR) {
      return;
    }

    if (installLocationQuery.data.includes('homebrew')) {
      await $.spawn('brew uninstall terraform', { interactive: true });
      return;
    }

    await $.spawn(`rm ${installLocationQuery.data}`, { requiresRoot: true });
    await FileUtils.removeLineFromShellRc(`export PATH=$PATH:${installLocationQuery.data}`);
  }

  private async getLatestTerraformInfo(): Promise<HashicorpReleaseInfo> {
    const terraformVersionQuery = await fetch(TERRAFORM_RELEASES_API_URL)
    if (!terraformVersionQuery.ok) {
      throw new Error(`Resource ${this.getSettings().id}. Un-able to fetch Terraform version list`)
    }

    const json = await terraformVersionQuery.json() as HashicorpReleasesAPIResponse;

    // TODO: Allow pre-release builds here in the future
    return json
      .filter((r) => !r.is_prerelease)
      .sort((a, b) =>
        semver.rcompare(a.version, b.version)
      )[0];
  }

  private async getReleaseInfo(version: string): Promise<HashicorpReleaseInfo | null> {
    const terraformVersionQuery = await fetch(TERRAFORM_RELEASE_INFO_API_URL(version))
    if (!terraformVersionQuery.ok) {
      return null;
    }

    return terraformVersionQuery.json()
  }

  private async getDownloadUrl(releaseInfo: HashicorpReleaseInfo, isArm: boolean): Promise<null | string> {
    const arch = isArm ? 'arm64' : 'amd64';
    const osParam = os.platform() === 'darwin' ? 'darwin' : 'linux';

    const build = releaseInfo.builds.find((b) => b.arch === arch && b.os === osParam);
    if (!build) {
      return null;
    }

    return build.url;
  }

  private async createBinDirectoryIfNotExists(): Promise<void> {
    let lstat = null;
    try {
      lstat = await fs.lstat('/usr/local/bin')
    } catch {}

    if (lstat && lstat.isDirectory()) {
      return;
    }

    if (lstat && !lstat.isDirectory()) {
      throw new Error('Found file at /usr/local/bin. Cannot create a directory there')
    }

    await codifySpawn('sudo mkdir -p -m 775 /usr/local/bin')
  }

  async createDirectoryIfNotExists(path: string): Promise<void> {
    let lstat = null;
    try {
      lstat = await fs.lstat(path)
    } catch {}

    if (lstat && lstat.isDirectory()) {
      return;
    }

    if (lstat && !lstat.isDirectory()) {
      throw new Error(`Found file at ${path}. Cannot create a directory there`)
    }

    await fs.mkdir(path, { recursive: true })
  }
}
