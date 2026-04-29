import { ExampleConfigs } from '@codifycli/plugin-core';

export const exampleAwsCliConfigs: ExampleConfigs = {
  example1: {
    title: 'Install AWS CLI and configure a profile',
    description: 'Install the AWS CLI and set up a default profile with credentials — a complete AWS setup from scratch.',
    configs: [
      {
        type: 'aws-cli',
      },
      {
        type: 'aws-profile',
        profile: 'default',
        awsAccessKeyId: '<Replace me here!>',
        awsSecretAccessKey: '<Replace me here!>',
        region: 'us-east-1',
        output: 'json',
      },
    ]
  },
}
