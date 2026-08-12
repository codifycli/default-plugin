import { PluginTester } from '@codifycli/plugin-test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TEST_DIR = path.join(os.tmpdir(), 'codify-fastlane-project-test');
const FASTLANE_DIR = path.join(TEST_DIR, 'fastlane');
const APPFILE_PATH = path.join(FASTLANE_DIR, 'Appfile');
const FASTFILE_PATH = path.join(FASTLANE_DIR, 'Fastfile');

describe('fastlane-project resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('Can initialize a project with an Appfile and Fastfile', { timeout: 120_000 }, async () => {
    const initialFastfile = [
      'default_platform(:ios)',
      '',
      'platform :ios do',
      '  lane :test do',
      '  end',
      'end',
      '',
    ].join('\n');

    await PluginTester.fullTest(
      pluginPath,
      [{
        type: 'fastlane-project',
        directory: TEST_DIR,
        appIdentifier: 'com.company.myapp',
        teamId: 'ABCDE12345',
        fastfile: initialFastfile,
      }],
      {
        validateApply: async () => {
          const appfileContent = await fs.readFile(APPFILE_PATH, 'utf8');
          expect(appfileContent).toContain('app_identifier("com.company.myapp")');
          expect(appfileContent).toContain('team_id("ABCDE12345")');

          const fastfileContent = await fs.readFile(FASTFILE_PATH, 'utf8');
          expect(fastfileContent).toBe(initialFastfile);
        },
        testModify: {
          modifiedConfigs: [{
            type: 'fastlane-project',
            directory: TEST_DIR,
            appIdentifier: 'com.company.myapp',
            teamId: 'ZYXWV98765',
            fastfile: initialFastfile,
          }],
          validateModify: async () => {
            const appfileContent = await fs.readFile(APPFILE_PATH, 'utf8');
            expect(appfileContent).toContain('team_id("ZYXWV98765")');
          },
        },
        validateDestroy: async () => {
          const exists = await fs.access(FASTLANE_DIR).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        },
      },
    );
  });

  it('Can manage a Fastfile lane for Android Play Store deployment', { timeout: 120_000 }, async () => {
    const fastfile = [
      'default_platform(:android)',
      '',
      'platform :android do',
      '  lane :deploy do',
      '    gradle(task: "bundle", build_type: "Release")',
      '    upload_to_play_store(track: "production")',
      '  end',
      'end',
      '',
    ].join('\n');

    await PluginTester.fullTest(
      pluginPath,
      [{
        type: 'fastlane-project',
        directory: TEST_DIR,
        appIdentifier: 'com.company.myandroidapp',
        jsonKeyFile: '~/play-store-key.json',
        fastfile,
      }],
      {
        validateApply: async () => {
          const appfileContent = await fs.readFile(APPFILE_PATH, 'utf8');
          expect(appfileContent).toContain('json_key_file("~/play-store-key.json")');

          const fastfileContent = await fs.readFile(FASTFILE_PATH, 'utf8');
          expect(fastfileContent).toContain('upload_to_play_store(track: "production")');
        },
        validateDestroy: async () => {
          const exists = await fs.access(FASTLANE_DIR).then(() => true).catch(() => false);
          expect(exists).toBe(false);
        },
      },
    );
  });
});
