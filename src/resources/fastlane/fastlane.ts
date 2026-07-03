import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  PackageManager,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

const schema = z
  .object({
    version: z
      .string()
      .optional()
      .describe(
        'Specific fastlane version to install (e.g. "2.223.1"). On Linux this pins the gem ' +
        'version installed via `gem install`. On macOS (Homebrew), Homebrew always installs its ' +
        'latest available formula version, so this field is informational only there.',
      ),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/fastlane/fastlane' })
  .describe('fastlane installation — mobile app build, signing, testing, and release automation');

export type FastlaneConfig = z.infer<typeof schema>;

const defaultConfig: Partial<FastlaneConfig> = {};

const examplePinnedVersion: ExampleConfig = {
  title: 'Install a pinned fastlane version',
  description: 'Install a specific fastlane version for reproducible CI/CD builds across machines.',
  configs: [{
    type: 'fastlane',
    version: '2.223.1',
  }],
};

const exampleWithProjectInit: ExampleConfig = {
  title: 'Install fastlane and initialize a project',
  description: 'Install fastlane, then initialize it in a project directory with a starter lane.',
  configs: [
    {
      type: 'fastlane',
    },
    {
      type: 'fastlane-project',
      directory: '~/projects/my-app',
      appIdentifier: 'com.company.myapp',
      dependsOn: ['fastlane'],
    },
  ],
};

export class FastlaneResource extends Resource<FastlaneConfig> {
  getSettings(): ResourceSettings<FastlaneConfig> {
    return {
      id: 'fastlane',
      defaultConfig,
      exampleConfigs: {
        example1: examplePinnedVersion,
        example2: exampleWithProjectInit,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        version: { type: 'version', canModify: true },
      },
    };
  }

  async refresh(parameters: Partial<FastlaneConfig>): Promise<Partial<FastlaneConfig> | null> {
    const $ = getPty();
    const { status, data } = await $.spawnSafe('fastlane --version');
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    const result: Partial<FastlaneConfig> = {};
    if (parameters.version) {
      const match = data.match(/(\d+\.\d+\.\d+)/);
      result.version = match?.[1];
    }

    return result;
  }

  async create(plan: CreatePlan<FastlaneConfig>): Promise<void> {
    await assertRubyAvailable();

    const { version } = plan.desiredConfig;
    if (Utils.isMacOS()) {
      await Utils.installViaPkgMgr('fastlane', undefined, PackageManager.BREW);
      return;
    }

    await Utils.installViaPkgMgr('build-essential');
    const $ = getPty();
    // Deliberately not using requiresRoot here: fastlane's own docs recommend against installing
    // gems into a sudo-owned system Ruby. Users are expected to bring a user-writable Ruby (e.g.
    // via the rbenv resource), matching the ruby check above.
    await $.spawn(`gem install fastlane${version ? ` -v ${version}` : ''}`, { interactive: true });
  }

  async modify(pc: ParameterChange<FastlaneConfig>, plan: ModifyPlan<FastlaneConfig>): Promise<void> {
    if (pc.name !== 'version' || Utils.isMacOS()) {
      return;
    }

    const { version } = plan.desiredConfig;
    const $ = getPty();
    await $.spawn(`gem install fastlane${version ? ` -v ${version}` : ''}`, { interactive: true });
  }

  async destroy(plan: DestroyPlan<FastlaneConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await Utils.uninstallViaPkgMgr('fastlane', undefined, PackageManager.BREW);
      return;
    }

    const $ = getPty();
    await $.spawnSafe('gem uninstall fastlane --all --executables', { interactive: true });
  }
}

async function assertRubyAvailable(): Promise<void> {
  const $ = getPty();
  const { status, data } = await $.spawnSafe('ruby -v');
  if (status === SpawnStatus.ERROR) {
    throw new Error(
      'fastlane requires Ruby 3.0 or newer, but Ruby was not found on this system. ' +
      'Install Ruby first — the rbenv resource in this plugin can install and manage Ruby versions for you.',
    );
  }

  const match = data.match(/ruby (\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(
      'fastlane requires Ruby 3.0 or newer. Unable to determine the installed Ruby version. ' +
      'The rbenv resource in this plugin can install and manage Ruby versions for you.',
    );
  }

  const major = Number(match[1]);
  if (major < 3) {
    throw new Error(
      `fastlane requires Ruby 3.0 or newer, but found Ruby ${match[1]}.${match[2]}.${match[3]}. ` +
      'Use the rbenv resource in this plugin to install and set a newer Ruby version.',
    );
  }
}
