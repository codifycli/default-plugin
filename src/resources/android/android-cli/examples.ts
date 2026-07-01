import { ExampleConfig } from '@codifycli/plugin-core';

export const exampleAndroidCliBasic: ExampleConfig = {
  title: 'Android development environment',
  description: 'Install the Android CLI with essential SDK packages for building Android apps — platform, build tools, and ADB.',
  configs: [
    {
      type: 'android-cli',
      sdkPackages: ['cmdline-tools/latest', 'platform-tools', 'platforms/android-35', 'build-tools/35.0.0'],
    },
  ],
};

export const exampleAndroidCliFullSetup: ExampleConfig = {
  title: 'Android environment with emulator',
  description: 'Install Android CLI with SDK packages and provision a Pixel 9 emulator for local development and testing.',
  configs: [
    {
      type: 'android-cli',
      sdkPackages: [
        'cmdline-tools/latest',
        'platform-tools',
        'platforms/android-35',
        'build-tools/35.0.0',
        'system-images/android-35/google_apis_playstore/x86_64',
      ],
      emulators: ['pixel_9'],
    },
  ],
};
