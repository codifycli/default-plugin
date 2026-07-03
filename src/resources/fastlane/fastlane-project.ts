import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { untildify } from '../../utils/untildify.js';

const DEFAULT_FASTFILE = [
  'default_platform(:ios)',
  '',
  'platform :ios do',
  '  lane :example do',
  '    # Add your lane actions here, e.g. build_app, upload_to_app_store',
  '  end',
  'end',
  '',
].join('\n');

const schema = z
  .object({
    directory: z
      .string()
      .describe(
        'Path to the project directory. Configuration is written to <directory>/fastlane/Appfile ' +
        'and <directory>/fastlane/Fastfile.',
      ),
    appIdentifier: z
      .string()
      .optional()
      .describe('iOS bundle identifier or Android package name, written as app_identifier in the Appfile.'),
    appleId: z
      .string()
      .optional()
      .describe('Apple ID email used to authenticate with App Store Connect, written as apple_id in the Appfile.'),
    teamId: z
      .string()
      .optional()
      .describe('Apple Developer Portal team ID, written as team_id in the Appfile.'),
    itcTeamId: z
      .string()
      .optional()
      .describe('App Store Connect team ID, only needed if it differs from teamId. Written as itc_team_id in the Appfile.'),
    jsonKeyFile: z
      .string()
      .optional()
      .describe('Path to the Google Play service account JSON key file, written as json_key_file in the Appfile.'),
    fastfile: z
      .string()
      .optional()
      .describe(
        'Raw Ruby content for fastlane/Fastfile — defines your lanes (e.g. lanes calling build_app, ' +
        'upload_to_app_store, gradle, upload_to_play_store).',
      ),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/fastlane/fastlane-project' })
  .describe('Per-project fastlane initialization (Appfile + Fastfile)');

export type FastlaneProjectConfig = z.infer<typeof schema>;

const defaultConfig: Partial<FastlaneProjectConfig> = {
  fastfile: DEFAULT_FASTFILE,
};

const exampleAppStoreRelease: ExampleConfig = {
  title: 'iOS App Store release lane',
  description: 'Initialize fastlane for an iOS project with a lane that builds the app and uploads it to App Store Connect.',
  configs: [{
    type: 'fastlane-project',
    directory: '~/projects/my-ios-app',
    appIdentifier: 'com.company.myiosapp',
    appleId: 'developer@company.com',
    teamId: 'ABCDE12345',
    fastfile: [
      'default_platform(:ios)',
      '',
      'platform :ios do',
      '  lane :release do',
      '    build_app(scheme: "MyApp")',
      '    upload_to_app_store(',
      '      api_key_path: "fastlane/api_key.json",',
      '      skip_metadata: true,',
      '      skip_screenshots: true,',
      '      submit_for_review: false',
      '    )',
      '  end',
      'end',
      '',
    ].join('\n'),
    os: ['macOS'],
  }],
};

const exampleAndroidPlayStoreRelease: ExampleConfig = {
  title: 'Android Play Store release setup',
  description: 'Install fastlane and initialize it for an Android project with a lane that builds a release bundle and uploads it to the Play Store.',
  configs: [
    {
      type: 'fastlane',
    },
    {
      type: 'fastlane-project',
      directory: '~/projects/my-android-app',
      appIdentifier: 'com.company.myandroidapp',
      jsonKeyFile: '~/projects/my-android-app/play-store-key.json',
      fastfile: [
        'default_platform(:android)',
        '',
        'platform :android do',
        '  lane :deploy do',
        '    gradle(task: "bundle", build_type: "Release")',
        '    upload_to_play_store(track: "production")',
        '  end',
        'end',
        '',
      ].join('\n'),
      dependsOn: ['fastlane'],
    },
  ],
};

export class FastlaneProjectResource extends Resource<FastlaneProjectConfig> {
  getSettings(): ResourceSettings<FastlaneProjectConfig> {
    return {
      id: 'fastlane-project',
      defaultConfig,
      exampleConfigs: {
        example1: exampleAppStoreRelease,
        example2: exampleAndroidPlayStoreRelease,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['fastlane'],
      parameterSettings: {
        directory: { type: 'directory', canModify: false },
        appIdentifier: { canModify: true },
        appleId: { canModify: true },
        teamId: { canModify: true },
        itcTeamId: { canModify: true },
        jsonKeyFile: { canModify: true },
        fastfile: { canModify: true },
      },
      allowMultiple: {
        identifyingParameters: ['directory'],
      },
    };
  }

  async refresh(parameters: Partial<FastlaneProjectConfig>): Promise<Partial<FastlaneProjectConfig> | null> {
    if (!parameters.directory) {
      return null;
    }

    const fastlaneDir = resolveFastlaneDir(parameters.directory);

    try {
      await fs.access(resolveFastfilePath(parameters.directory));
    } catch {
      return null;
    }

    const result: Partial<FastlaneProjectConfig> = { ...parameters };

    if (parameters.fastfile != null) {
      try {
        result.fastfile = await fs.readFile(resolveFastfilePath(parameters.directory), 'utf8');
      } catch {
        result.fastfile = undefined;
      }
    }

    let appfileContent: string | undefined;
    try {
      appfileContent = await fs.readFile(path.join(fastlaneDir, 'Appfile'), 'utf8');
    } catch {
      appfileContent = undefined;
    }

    if (parameters.appIdentifier != null) {
      result.appIdentifier = extractAppfileValue(appfileContent, 'app_identifier');
    }
    if (parameters.appleId != null) {
      result.appleId = extractAppfileValue(appfileContent, 'apple_id');
    }
    if (parameters.teamId != null) {
      result.teamId = extractAppfileValue(appfileContent, 'team_id');
    }
    if (parameters.itcTeamId != null) {
      result.itcTeamId = extractAppfileValue(appfileContent, 'itc_team_id');
    }
    if (parameters.jsonKeyFile != null) {
      result.jsonKeyFile = extractAppfileValue(appfileContent, 'json_key_file');
    }

    return result;
  }

  async create(plan: CreatePlan<FastlaneProjectConfig>): Promise<void> {
    const { directory, fastfile } = plan.desiredConfig;
    const fastlaneDir = resolveFastlaneDir(directory);

    await fs.mkdir(fastlaneDir, { recursive: true });
    await fs.writeFile(path.join(fastlaneDir, 'Appfile'), generateAppfile(plan.desiredConfig), 'utf8');
    await fs.writeFile(path.join(fastlaneDir, 'Fastfile'), fastfile ?? DEFAULT_FASTFILE, 'utf8');
  }

  async modify(pc: ParameterChange<FastlaneProjectConfig>, plan: ModifyPlan<FastlaneProjectConfig>): Promise<void> {
    const { directory, fastfile } = plan.desiredConfig;
    const fastlaneDir = resolveFastlaneDir(directory);

    if (pc.name === 'fastfile') {
      await fs.writeFile(path.join(fastlaneDir, 'Fastfile'), fastfile ?? DEFAULT_FASTFILE, 'utf8');
      return;
    }

    await fs.writeFile(path.join(fastlaneDir, 'Appfile'), generateAppfile(plan.desiredConfig), 'utf8');
  }

  async destroy(plan: DestroyPlan<FastlaneProjectConfig>): Promise<void> {
    const { directory } = plan.currentConfig;
    if (!directory) {
      return;
    }

    await fs.rm(resolveFastlaneDir(directory), { recursive: true, force: true });
  }
}

function resolveFastlaneDir(directory: string): string {
  return path.join(untildify(directory), 'fastlane');
}

function resolveFastfilePath(directory: string): string {
  return path.join(resolveFastlaneDir(directory), 'Fastfile');
}

function generateAppfile(config: Partial<FastlaneProjectConfig>): string {
  const lines: string[] = [];

  if (config.appIdentifier) {
    lines.push(`app_identifier("${config.appIdentifier}")`);
  }
  if (config.appleId) {
    lines.push(`apple_id("${config.appleId}")`);
  }
  if (config.teamId) {
    lines.push(`team_id("${config.teamId}")`);
  }
  if (config.itcTeamId) {
    lines.push(`itc_team_id("${config.itcTeamId}")`);
  }
  if (config.jsonKeyFile) {
    lines.push(`json_key_file("${config.jsonKeyFile}")`);
  }

  return lines.length > 0 ? `${lines.join('\n')}\n` : '';
}

function extractAppfileValue(content: string | undefined, key: string): string | undefined {
  if (!content) {
    return undefined;
  }

  const match = content.match(new RegExp(`${key}\\("([^"]*)"\\)`));
  return match?.[1];
}
