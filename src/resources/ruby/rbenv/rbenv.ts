import { ExampleConfig, FileUtils, getPty, Resource, ResourceSettings, SpawnStatus, Utils, PackageManager, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import os from 'node:os';
import path from 'node:path';

import { globalVersionSchema, versionsArraySchema } from '../../../utils/version-aliases.js';
import { GemsParameter } from './gems-parameter.js';
import { RbenvGlobalParameter } from './global-parameter.js';
import { RubyVersionsParameter } from './ruby-versions-parameter.js';
import { requiresOnMacOS } from '../../../utils/requires.js';

const RBENV_ROOT = path.join(os.homedir(), '.rbenv');
const RBENV_PATH_EXPORT = 'export PATH="$HOME/.rbenv/bin:$PATH"';
const RBENV_INIT = 'eval "$(rbenv init -)"';

const schema = z.object({
  rubyVersions: versionsArraySchema(['latest'], 'Ruby versions to install via rbenv (e.g. ["3.3.0", "3.2.4"]).')
    .optional(),
  global: globalVersionSchema(['latest'], 'The global Ruby version set by rbenv.')
    .optional(),
  gems: z
    .array(z.string().describe('Gem name, optionally with a version: "apiaryio", "rails@7.2.0". Without a version (or with @latest) the newest version is installed and any installed version counts as installed.'))
    .optional()
    .describe('Ruby gems to install with gem install into the global rbenv Ruby, e.g. ["apiaryio", "cocoapods", "rails@7.2.0"]. Only the listed gems are managed.'),
})
  .describe('rbenv resource — install and manage multiple Ruby versions');

export type RbenvConfig = z.infer<typeof schema>;

const defaultConfig: Partial<RbenvConfig> = {
  rubyVersions: ['latest'],
  global: 'latest',
  gems: [],
};

const exampleBasic: ExampleConfig = {
  title: 'Install rbenv with a global Ruby version',
  description: 'Install rbenv, download the newest stable Ruby, and set it as the default global version.',
  configs: [
    {
      type: 'rbenv',
      rubyVersions: ['latest'],
      global: 'latest',
    },
  ],
};

const exampleGems: ExampleConfig = {
  title: 'Ruby with command-line gems',
  description: 'Install the newest Ruby with rbenv along with gem-based CLIs such as the Apiary CLI and CocoaPods, without touching the system Ruby.',
  configs: [
    {
      type: 'rbenv',
      rubyVersions: ['latest'],
      global: 'latest',
      gems: ['apiaryio', 'cocoapods'],
    },
  ],
};

export class RbenvResource extends Resource<RbenvConfig> {
  getSettings(): ResourceSettings<RbenvConfig> {
    return {
      id: 'rbenv',
      requires: requiresOnMacOS('homebrew', 'xcode-tools'),
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleGems,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        rubyVersions: { stateful: new RubyVersionsParameter(), order: 1 },
        global: { stateful: new RbenvGlobalParameter(), order: 2 },
        gems: { stateful: new GemsParameter(), order: 3 },
      },
    };
  }

  override async refresh(): Promise<Partial<RbenvConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('rbenv --version');
    return status === SpawnStatus.SUCCESS ? {} : null;
  }

  override async create(): Promise<void> {
    if (Utils.isMacOS()) {
      await installOnMacOS();
    } else {
      await installOnLinux();
    }
  }

  override async destroy(): Promise<void> {
    if (Utils.isMacOS()) {
      await uninstallOnMacOS();
    } else {
      await uninstallOnLinux();
    }
  }
}

async function installOnMacOS(): Promise<void> {
  const $ = getPty();
  await Utils.installViaPkgMgr('rbenv ruby-build', undefined, PackageManager.BREW);
  await FileUtils.addToShellRc(RBENV_INIT);
}

async function installOnLinux(): Promise<void> {
  const $ = getPty();

  await $.spawnSafe(`git clone https://github.com/rbenv/rbenv.git ${RBENV_ROOT}`, { interactive: true });

  const rubyBuildPath = path.join(RBENV_ROOT, 'plugins', 'ruby-build');
  await $.spawnSafe(`git clone https://github.com/rbenv/ruby-build.git ${rubyBuildPath}`, { interactive: true });

  await Utils.installViaPkgMgr(
    'curl autoconf patch build-essential rustc libssl-dev libyaml-dev libreadline6-dev zlib1g-dev libgmp-dev libncurses5-dev libffi-dev libgdbm6 libgdbm-dev libdb-dev uuid-dev'
  );

  await FileUtils.addAllToShellRc([RBENV_PATH_EXPORT, RBENV_INIT]);
}

async function uninstallOnMacOS(): Promise<void> {
  const $ = getPty();
  await Utils.uninstallViaPkgMgr('rbenv ruby-build', undefined, PackageManager.BREW);
  await removeRbenvFromShellRc([RBENV_INIT]);
}

async function uninstallOnLinux(): Promise<void> {
  const $ = getPty();
  await $.spawnSafe(`rm -rf ${RBENV_ROOT}`);
  if (await FileUtils.fileExists('/usr/bin/rbenv')) {
    await $.spawn('rm -f /usr/bin/rbenv', { requiresRoot: true });
  }
  await removeRbenvFromShellRc([RBENV_PATH_EXPORT, RBENV_INIT]);
}

/**
 * Removes rbenv-related lines from the shell RC file.
 * Skips gracefully if the shell RC file does not exist (e.g. rbenv was
 * already present on the machine before Codify managed it and was never
 * added to the RC in the first place).
 */
async function removeRbenvFromShellRc(lines: string[]): Promise<void> {
  const shellRc = Utils.getPrimaryShellRc();
  if (!(await FileUtils.fileExists(shellRc))) {
    return;
  }
  for (const line of lines) {
    await FileUtils.removeLineFromShellRc(line);
  }
}
