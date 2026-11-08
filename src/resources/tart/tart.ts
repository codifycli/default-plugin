import {
  CreatePlan,
  ExampleConfig,
  FileUtils,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty, z, Utils
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { TartCloneParameter } from './clone-parameter.js';
import { TartLoginParameter } from './login-parameter.js';

const TART_DOWNLOAD_URL = 'https://github.com/cirruslabs/tart/releases/latest/download/tart.tar.gz';
const TART_INSTALL_DIR = '/usr/local/tart';
const TART_BIN_PATH = '/usr/local/bin/tart';

const schema = z.object({
  tartHome: z
    .string()
    .describe('The home directory of tart. This controls where the images are stored. To create this, simply add an entry to the rc file of the shell specifying the TART_HOME environment variable')
    .optional(),
  // login: z
  //   .array(
  //     z.union([
  //       z.string().describe('The registry host to login to'),
  //       z.object({
  //         host: z.string().describe('The registry host'),
  //         username: z.string().describe('The username for authentication'),
  //         password: z.string().describe('The password for authentication')
  //       })
  //     ])
  //   )
  //   .describe('The registries to login to. This is a stateful parameter that controls the login. Can be a string (host) or an object with host, username, and password.')
  //   .optional(),
  clone: z.array(
    z.object({
      sourceName: z.string().describe('The source image to clone from (OCI registry)'),
      name: z.string().describe('The local name for the cloned image')
    })
  )
    .describe('The image to clone. This is a stateful parameter that controls which images are cloned. Can be a string (clone directly) or an object with sourceName and name.')
    .optional(),
});

export type TartConfig = z.infer<typeof schema>;

const defaultConfig: Partial<TartConfig> & { os: any } = {
  clone: [],
  os: ['macOS']
}

const exampleWithVm: ExampleConfig = {
  title: 'Install Tart and pull a macOS VM',
  description: 'Install Tart and clone a macOS Sequoia VM image ready to run locally.',
  configs: [
    {
      type: 'tart',
      os: ['macOS'],
    },
    {
      type: 'tart-vm',
      sourceName: 'ghcr.io/cirruslabs/macos-sequoia-base:latest',
      localName: 'sequoia',
      cpu: 4,
      memory: 8192,
      os: ['macOS'],
      dependsOn: ['tart'],
    },
  ]
}

const exampleWithTartHome: ExampleConfig = {
  title: 'Install Tart with a custom image storage location',
  description: 'Install Tart and set a custom TART_HOME directory to control where VM images are stored.',
  configs: [{
    type: 'tart',
    tartHome: '~/tart-vms',
    os: ['macOS'],
  }]
}

export class TartResource extends Resource<TartConfig> {
  getSettings(): ResourceSettings<TartConfig> {
    return {
      id: 'tart',
      defaultConfig,
      exampleConfigs: {
        example1: exampleWithVm,
        example2: exampleWithTartHome,
      },
      operatingSystems: [OS.Darwin],
      schema,
      parameterSettings: {
        tartHome: { type: 'directory', canModify: true },
        // login: { type: 'stateful', definition: new TartLoginParameter() },
        clone: { type: 'stateful', definition: new TartCloneParameter() },
      }
    };
  }

  async refresh(parameters: Partial<TartConfig>): Promise<Partial<TartConfig> | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which tart');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    const result: Partial<TartConfig> = {};

    // Check if TART_HOME is set
    if (parameters.tartHome) {
      const { tartHome } = parameters;
      try {
        await fs.access(tartHome);
        result.tartHome = tartHome;
      } catch {
        return null;
      }
    }

    return result;
  }

  async create(plan: CreatePlan<TartConfig>): Promise<void> {
    const $ = getPty();

    // Install tart from the official GitHub release rather than the cirruslabs/cli Homebrew tap.
    // The tap's GoReleaser-generated formulae declare both `depends_on :macos` and
    // `depends_on :macos => :ventura`, which Homebrew 6+ rejects as a hard error
    // (https://github.com/cirruslabs/homebrew-cli/issues/21).
    const curlCheck = await $.spawnSafe('which curl');
    if (curlCheck.status === SpawnStatus.ERROR) {
      await Utils.installViaPkgMgr('curl');
    }

    const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-tart-'));
    try {
      await $.spawn(`curl -fsSL ${TART_DOWNLOAD_URL} -o tart.tar.gz`, { cwd: temporaryDir });
      await $.spawn('tar -xzf tart.tar.gz', { cwd: temporaryDir });

      await $.spawn(`mkdir -p ${TART_INSTALL_DIR} /usr/local/bin`, { requiresRoot: true });
      await $.spawn(`rm -rf ${TART_INSTALL_DIR}/tart.app`, { requiresRoot: true });
      await $.spawn(`mv ./tart.app ${TART_INSTALL_DIR}/tart.app`, { cwd: temporaryDir, requiresRoot: true });
      await $.spawn(`ln -sf ${TART_INSTALL_DIR}/tart.app/Contents/MacOS/tart ${TART_BIN_PATH}`, { requiresRoot: true });
    } finally {
      await fs.rm(temporaryDir, { recursive: true, force: true });
    }

    // Set TART_HOME if specified
    if (plan.desiredConfig.tartHome) {
      const { tartHome } = plan.desiredConfig;

      // Create the directory if it doesn't exist
      await fs.mkdir(tartHome, { recursive: true });

      // Add TART_HOME to shell rc
       
      await FileUtils.addToShellRc(`export TART_HOME="${tartHome}"`);
    }

    // Verify installation
    const { status: verifyStatus } = await $.spawnSafe('which tart');
    if (verifyStatus !== SpawnStatus.SUCCESS) {
      throw new Error('Failed to install tart. Please check the installation logs.');
    }
  }

  async modify(pc: ParameterChange<TartConfig>, plan: ModifyPlan<TartConfig>): Promise<void> {
    if (pc.name === 'tartHome') {
      const { tartHome } = plan.desiredConfig;
      if (tartHome) {
        await fs.mkdir(tartHome, { recursive: true });
        await FileUtils.addToShellRc(`export TART_HOME="${tartHome}"`);
      } else {
        await FileUtils.removeLineFromShellRc(/^export TART_HOME=.*/);
      }
    }
  }

  async destroy(): Promise<void> {
    const $ = getPty();

    // Remove TART_HOME from shell rc if it was set
     
    await FileUtils.removeLineFromShellRc(/^export TART_HOME=.*/);

    await $.spawnSafe(`rm -f ${TART_BIN_PATH}`, { requiresRoot: true });
    await $.spawnSafe(`rm -rf ${TART_INSTALL_DIR}`, { requiresRoot: true });

    // Clean up installs made by earlier versions of this resource via the cirruslabs/cli tap
    const { status: brewStatus } = await $.spawnSafe('brew list --formula cirruslabs/cli/tart');
    if (brewStatus === SpawnStatus.SUCCESS) {
      await $.spawnSafe('brew uninstall --formula cirruslabs/cli/tart', {
        env: { HOMEBREW_NO_AUTO_UPDATE: 1, NONINTERACTIVE: 1 },
      });
    }
  }
}
