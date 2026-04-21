import { Resource, ResourceSettings, SpawnStatus, Utils, getPty, FileUtils } from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { exampleAwsCliConfigs } from '../examples.js';
import Schema from './aws-cli-schema.json';

export interface AwsCliConfig extends StringIndexedObject {
  // TODO: Add version parameter
  // TODO: Add setup parameter
  // TODO: Add parameter to prefer homebrew
}

export class AwsCliResource extends Resource<AwsCliConfig> {

  getSettings(): ResourceSettings<AwsCliConfig> {
    return {
      schema: Schema,
      exampleConfigs: {
        ...exampleAwsCliConfigs,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      id: 'aws-cli',
    };
  }

  override async refresh(): Promise<Partial<AwsCliConfig> | null> {
    const $ = getPty();

    const awsCliInfo = await $.spawnSafe('which aws');
    console.log('Spawn result', awsCliInfo);

    if (awsCliInfo.status === SpawnStatus.ERROR) {
      return null;
    }

    return {};
  }

  override async create(): Promise<void> {
    const $ = getPty();

    // Amazon has not released a standalone way to install arm aws-cli. See: https://github.com/aws/aws-cli/issues/7252
    // Prefer the homebrew version on M1
    const isArmArch = await Utils.isArmArch();

    if (Utils.isMacOS()) {
      const isRosettaInstalled = await Utils.isRosetta2Installed()
      const isHomebrewInstalled = await Utils.isHomebrewInstalled();

      if (isArmArch && isHomebrewInstalled) {
        console.log('Resource: \'aws-cli\'. Detected that mac is aarch64. Installing AWS-CLI via homebrew')
        await $.spawn('HOMEBREW_NO_AUTO_UPDATE=1 brew install awscli', { interactive: true })

      } else if (!isArmArch || isRosettaInstalled) {
        console.log('Resource: \'aws-cli\'. Detected that mac is not ARM or Rosetta is installed. Installing AWS-CLI standalone version')
        await $.spawn('curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"');
        await $.spawn('installer -pkg ./AWSCLIV2.pkg -target /', { requiresRoot: true })
        await fs.rm('./AWSCLIV2.pkg', { recursive: true, force: true });

      } else {
        // This covers arm arch + Homebrew is not installed
        throw new Error(`Resource: 'aws-cli'. This plugin prefers installing AWS-CLI via homebrew for M1 macs.
AWS has not updated the standalone installer to support M1 macs. See: https://github.com/aws/aws-cli/issues/7252. 

Homebrew can be installed by adding: 
{
  "type": "homebrew",
}

Or enable rosetta 2 using the below command and re-run:

softwareupdate --install-rosetta
      `);
      }
    } else if (Utils.isLinux()) {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-aws-cli'));

      // Detect architecture and use appropriate download link
      const downloadUrl = isArmArch
        ? 'https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip'
        : 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip';

      console.log(`Installing AWS CLI for Linux (${isArmArch ? 'ARM64' : 'x86_64'})...`);
      const unzipCheck = await $.spawnSafe('which unzip');
      if (unzipCheck.status === SpawnStatus.ERROR) {
        await Utils.installViaPkgMgr('unzip');
      }

      await FileUtils.downloadFile(downloadUrl, path.join(tmpDir, 'awscliv2.zip'));
      await $.spawn('unzip -q awscliv2.zip', { cwd: tmpDir });
      await $.spawn('./aws/install', { cwd: tmpDir, requiresRoot: true });
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  override async destroy(): Promise<void> {
    const $ = getPty();

    const installLocation = await this.findInstallLocation();
    if (!installLocation) {
      return;
    }

    if (installLocation.includes('homebrew')) {
      await $.spawn('brew uninstall awscli', { interactive: true, env: { HOMEBREW_NO_AUTO_UPDATE: 1 } });
      return;
    }

    await $.spawnSafe(`rm ${installLocation}`, { requiresRoot: true });
    await $.spawnSafe(`rm ${installLocation}_completer`, { requiresRoot: true });
    await $.spawnSafe('rm -rf $HOME/.aws/');
  }

  private async findInstallLocation(): Promise<null | string> {
    const $ = getPty();
    const query = await $.spawnSafe('which aws', { interactive: true });
    if (query.status === SpawnStatus.ERROR) {
      return null;
    }

    return query.data;
  }
}
