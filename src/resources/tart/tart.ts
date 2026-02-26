import {
  CreatePlan,
  FileUtils,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty, z
} from '@codifycli/plugin-core';
import { OS } from 'codify-schemas';
import * as fs from 'node:fs/promises';

import { TartCloneParameter } from './clone-parameter.js';
import { TartLoginParameter } from './login-parameter.js';

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

export class TartResource extends Resource<TartConfig> {
  getSettings(): ResourceSettings<TartConfig> {
    return {
      id: 'tart',
      operatingSystems: [OS.Darwin],
      schema,
      dependencies: ['homebrew'],
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

    // Check if Homebrew is installed
    const { status: brewStatus } = await $.spawnSafe('which brew', { interactive: true });
    if (brewStatus !== SpawnStatus.SUCCESS) {
      throw new Error('Homebrew is not installed. Please install Homebrew before installing tart.');
    }

    // Install tart via Homebrew
    await $.spawn('brew install cirruslabs/cli/tart', { interactive: true, env: { HOMEBREW_NO_AUTO_UPDATE: 1 } });

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

    // Uninstall tart via Homebrew
    const { status: brewStatus } = await $.spawnSafe('which brew');
    if (brewStatus === SpawnStatus.SUCCESS) {
      await $.spawn('brew uninstall cirruslabs/cli/tart', { interactive: true, env: { HOMEBREW_NO_AUTO_UPDATE: 1 } });
    }
  }
}
