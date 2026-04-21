import { FileUtils, getPty, Resource, ResourceSettings, SpawnStatus, Utils, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import os from 'node:os';
import path from 'node:path';

import { RbenvGlobalParameter } from './global-parameter.js';
import { RubyVersionsParameter } from './ruby-versions-parameter.js';

const RBENV_ROOT = path.join(os.homedir(), '.rbenv');
const RBENV_PATH_EXPORT = 'export PATH="$HOME/.rbenv/bin:$PATH"';
const RBENV_INIT = 'eval "$(rbenv init -)"';

const schema = z.object({
  rubyVersions: z
    .array(z.string())
    .describe('Ruby versions to install via rbenv (e.g. ["3.3.0", "3.2.4"])')
    .optional(),
  global: z
    .string()
    .describe('The global Ruby version set by rbenv.')
    .optional(),
})
  .describe('rbenv resource — install and manage multiple Ruby versions');

export type RbenvConfig = z.infer<typeof schema>;

export class RbenvResource extends Resource<RbenvConfig> {
  getSettings(): ResourceSettings<RbenvConfig> {
    return {
      id: 'rbenv',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        rubyVersions: { type: 'stateful', definition: new RubyVersionsParameter(), order: 1 },
        global: { type: 'stateful', definition: new RbenvGlobalParameter(), order: 2 },
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
  await $.spawn('brew install rbenv ruby-build', {
    interactive: true,
    env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
  });
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
  await $.spawn('brew uninstall rbenv ruby-build', {
    interactive: true,
    env: { HOMEBREW_NO_AUTO_UPDATE: '1' },
  });
  await removeRbenvFromShellRc([RBENV_INIT]);
}

async function uninstallOnLinux(): Promise<void> {
  const $ = getPty();
  await $.spawnSafe(`rm -rf ${RBENV_ROOT}`);
  await $.spawnSafe('rm -f /usr/bin/rbenv');
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
