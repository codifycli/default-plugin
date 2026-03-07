import {
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import Schema from './aws-profile-schema.json'
import { CSVCredentialsTransformation } from './csv-credentials-transformation.js';

export interface AwsProfileConfig extends StringIndexedObject {
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  csvCredentials: string,
  metadataServiceNumAttempts?: number;
  metadataServiceTimeout?: number;
  output?: string;
  profile: string;
  region: string;
}

export class AwsProfileResource extends Resource<AwsProfileConfig> {

  getSettings(): ResourceSettings<AwsProfileConfig> {
    return {
      id: 'aws-profile',
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: ['aws-cli'],
      schema: Schema,
      parameterSettings: {
        awsAccessKeyId: { canModify: true },
        awsSecretAccessKey: { canModify: true, isSensitive: true },
        csvCredentials: { type: 'directory', setting: true }, // Type setting means it won't be included in the plan calculation
        output: { default: 'json', canModify: true },
        profile: { default: 'default', canModify: true },
        metadataServiceNumAttempts: { canModify: true, setting: true },
        metadataServiceTimeout: { canModify: true, setting: true },
      },
      transformation: CSVCredentialsTransformation,
      importAndDestroy:{
        requiredParameters: ['profile']
      },
      allowMultiple: {
        identifyingParameters: ['profile'],
        findAllParameters: async () => {
          const $ = getPty();
          const { status } = await $.spawnSafe('which aws');
          if (status === 'error') {
            return [];
          }

          const { data } = await $.spawnSafe('aws configure list-profiles')

          return data
            ?.split(/\n/)
            ?.filter(Boolean)
            ?.map((profile) => ({ profile }))
          ?? [];
        }
      }
    };
  }

  override async validate(parameters: Partial<AwsProfileConfig>): Promise<void> {
    // if (parameters.csvCredentials
    //   && (parameters.awsAccessKeyId || parameters.awsSecretAccessKey)) {
    //   throw new Error('Csv credentials cannot be added together with awsAccessKeyId or awsSecretAccessKey')
    // }
  }

  override async refresh(parameters: Partial<AwsProfileConfig>): Promise<Partial<AwsProfileConfig> | null> {
    const $ = getPty();

    const profile = parameters.profile!;

    // Make sure aws-cli is installed
    const { status: awsStatus } = await $.spawnSafe('which aws');
    if (awsStatus === SpawnStatus.ERROR) {
      return null;
    }

    // Check if the profile exists
    const { data: profiles } = await $.spawn('aws configure list-profiles');
    if (!profiles.includes(profile)) {
      return null;
    }

    const awsAccessKeyId = await this.getAwsConfigureValueOrNull('aws_access_key_id', profile);
    const awsSecretAccessKey = await this.getAwsConfigureValueOrNull('aws_secret_access_key', profile);

    const result: Partial<AwsProfileConfig> = {
      awsAccessKeyId: awsAccessKeyId ?? undefined,
      awsSecretAccessKey: awsSecretAccessKey ?? undefined,
      profile,
    };

    if (parameters.region !== undefined) {
      result.region = await this.getAwsConfigureValueOrNull('region', profile);
    }

    if (parameters.output !== undefined) {
      result.output = await this.getAwsConfigureValueOrNull('output', profile);
    }

    if (parameters.metadataServiceTimeout) {
      const metadataServiceTimeout = await this.getAwsConfigureValueOrNull('metadata_service_timeout', profile);
      if (metadataServiceTimeout) {
        result.metadataServiceTimeout = Number.parseInt(metadataServiceTimeout, 10);
      }
    }

    if (parameters.metadataServiceNumAttempts) {
      const metadataServiceNumAttempts = await this.getAwsConfigureValueOrNull('metadata_service_num_attempts', profile);
      if (metadataServiceNumAttempts) {
        result.metadataServiceNumAttempts = Number.parseInt(metadataServiceNumAttempts, 10);
      }
    }

    return result;
  }

  override async create(plan: CreatePlan<AwsProfileConfig>): Promise<void> {
    const $ = getPty();

    // Assert that aws-cli is installed
    await $.spawn('which aws', { interactive: true })

    const {
      awsAccessKeyId,
      awsSecretAccessKey,
      metadataServiceNumAttempts,
      metadataServiceTimeout,
      output,
      profile,
      region
    } = plan.desiredConfig;

    await this.setAwsConfigureValue('aws_access_key_id', awsAccessKeyId, profile);
    await this.setAwsConfigureValue('aws_secret_access_key', awsSecretAccessKey, profile);
    await this.setAwsConfigureValue('region', region, profile);
    await this.setAwsConfigureValue('output', output!, profile);

    if (metadataServiceTimeout) {
      await this.setAwsConfigureValue('metadata_service_timeout', metadataServiceTimeout, profile);
    }

    if (metadataServiceNumAttempts) {
      await this.setAwsConfigureValue('metadata_service_num_attempts', metadataServiceNumAttempts, profile);
    }
  }

  override async modify(
    pc: ParameterChange<AwsProfileConfig>,
    plan: ModifyPlan<AwsProfileConfig>
  ): Promise<void> {
    await this.setAwsConfigureValue(pc.name, pc.newValue, plan.desiredConfig.profile);
  }

  override async destroy(plan: DestroyPlan<AwsProfileConfig>): Promise<void> {
    const { profile } = plan.currentConfig;

    const credentialsPath = path.resolve(os.homedir(), '.aws', 'credentials');
    const credentialsFile = await fs.readFile(credentialsPath, 'utf8');

    // Split using header [PROFILE_NAME]. Using a negative lookup so header remains after split
    const credentialsBlocks = credentialsFile.split(/(?=\[.*\])/)
    const credentialsPrefilterLength = credentialsBlocks.length;

    const filteredCredentialsBlocks = credentialsBlocks.filter((b) => b.includes(`[${profile}])`))
    if (filteredCredentialsBlocks.length === credentialsPrefilterLength) {
      throw new Error(`Unable to find profile ${profile} in .aws/credentials. Please remove the profile and re-run Codify`);
    }

    await fs.writeFile(credentialsPath, filteredCredentialsBlocks.join('\n'), 'utf8');

    const configPath = path.resolve(os.homedir(), '.aws', 'config');
    const configFile = await fs.readFile(configPath, 'utf8');

    const configBlocks = configFile.split(/(?=\[.*\])/) // Split using header [PROFILE_NAME]. Using a negative lookup so header remains after split
    const filteredConfigBlocks = configBlocks.filter((b) => b.includes(`[profile ${profile}])`) || b.includes(`[${profile}]`))

    await fs.writeFile(configPath, filteredConfigBlocks.join('\n'), 'utf8');
  }

  private async getAwsConfigureValueOrNull(key: string, profile: string): Promise<string | undefined> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe(`aws configure get ${key} --profile ${profile}`, { interactive: true });
    if (status === SpawnStatus.ERROR) {
      return undefined;
    }

    return data.trim();
  }

  private async setAwsConfigureValue(key: string, value: number | string, profile: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`aws configure set ${key} ${value} --profile ${profile}`, { interactive: true });
  }
}
