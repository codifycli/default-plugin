import { type InputTransformation, untildify } from '@codifycli/plugin-core';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { AwsProfileConfig } from './aws-profile.js';

export const CSVCredentialsTransformation: InputTransformation = {
  async to(input: Partial<AwsProfileConfig>): Promise<Partial<AwsProfileConfig>> {
    if (!input.csvCredentials) {
      return input;
    }

    const csvPath = path.resolve(untildify(input.csvCredentials));

    if (!fsSync.existsSync(csvPath)) {
      throw new Error(`File ${csvPath} does not exist`);
    }

    const file = await fs.readFile(csvPath, 'utf8');

    const credentials = file.split('\n')?.[1]?.trim();
    if (!credentials) {
      throw new Error('AWS Credentials csv is malformed.');
    }

    const [awsAccessKeyId, awsSecretAccessKey] = credentials.split(',');
    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error(`File ${csvPath} is not properly formatted. It must be a csv in the format: awsAccessKeyId, awsSecretAccessKey`);
    }

    return {
      ...input,
      awsAccessKeyId,
      awsSecretAccessKey,
    };
  },
  
  from(output: Partial<AwsProfileConfig>): Partial<AwsProfileConfig> {
    if (output.csvCredentials) {
      delete output.awsAccessKeyId;
      delete output.awsSecretAccessKey;
    }

    return output;
  }
};
