import {
  ExampleConfig,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  PackageManager,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { XcodesSelectedParameter } from './selected-parameter.js';
import { XcodeVersionsParameter } from './xcode-versions-parameter.js';

const schema = z
  .object({
    xcodeVersions: z
      .array(z.string())
      .describe(
        'List of Xcode versions to install via xcodes (e.g. ["15.2", "14.3.1"]). ' +
        'Use "latest" to install the newest available Xcode release (runs `xcodes install --latest`).'
      )
      .optional(),
    selected: z
      .string()
      .describe(
        'The active Xcode version to select (e.g. "15.2"). ' +
        'Must be one of the installed xcodeVersions. Equivalent to running xcodes select.'
      )
      .optional(),
    appleId: z
      .string()
      .optional()
      .describe(
        'Apple ID email used to authenticate with Apple servers when downloading Xcode. ' +
        'If omitted, xcodes will prompt interactively on first install.'
      ),
    appleIdPassword: z
      .string()
      .optional()
      .describe(
        'Apple ID password. Required alongside appleId for non-interactive installs.'
      ),
    acceptLicense: z
      .boolean()
      .optional()
      .describe(
        'Automatically accept the Xcode license agreement after installation. ' +
        'Runs `sudo xcodebuild -license accept`. Defaults to true.'
      ),
  })
  .describe('xcodes resource — install and manage multiple Xcode versions via the xcodes CLI');

export type XcodesConfig = z.infer<typeof schema>;

const defaultConfig: Partial<XcodesConfig> = {
  xcodeVersions: [],
};

const exampleStandardSetup: ExampleConfig = {
  title: 'Install a specific Xcode version',
  description: 'Install xcodes and a specific Xcode release, setting it as the active version — a common setup for iOS teams standardising on a single Xcode version.',
  configs: [{
    type: 'xcodes',
    xcodeVersions: ['15.4'],
    selected: '15.4',
    os: ['macOS'],
  }],
};

const exampleMultiVersion: ExampleConfig = {
  title: 'Install multiple Xcode versions',
  description: 'Install several Xcode versions side by side and set the latest stable release as active — useful when supporting multiple iOS SDK targets.',
  configs: [{
    type: 'xcodes',
    xcodeVersions: ['14.3.1', '15.4'],
    selected: '15.4',
    os: ['macOS'],
  }],
};

export class XcodesResource extends Resource<XcodesConfig> {
  getSettings(): ResourceSettings<XcodesConfig> {
    return {
      id: 'xcodes',
      defaultConfig,
      exampleConfigs: {
        example1: exampleStandardSetup,
        example2: exampleMultiVersion,
      },
      operatingSystems: [OS.Darwin],
      schema,
      parameterSettings: {
        xcodeVersions: { type: 'stateful', definition: new XcodeVersionsParameter(), order: 1 },
        selected: { type: 'stateful', definition: new XcodesSelectedParameter(), order: 2 },
        appleId: { type: 'string', setting: true },
        appleIdPassword: { type: 'string', setting: true },
        acceptLicense: { type: 'boolean', setting: true, default: true },
      },
    };
  }

  override async refresh(): Promise<Partial<XcodesConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('which xcodes');
    return status === SpawnStatus.SUCCESS ? {} : null;
  }

  override async create(): Promise<void> {
    await Utils.installViaPkgMgr('xcodes', undefined, PackageManager.BREW);
  }

  override async destroy(): Promise<void> {
    await Utils.uninstallViaPkgMgr('xcodes', undefined, PackageManager.BREW);
  }
}
