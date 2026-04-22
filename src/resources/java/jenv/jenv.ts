import { Resource, ResourceSettings, SpawnStatus, getPty, Utils } from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import * as fs from 'node:fs';

import { FileUtils } from '../../../utils/file-utils.js';
import { JenvGlobalParameter } from './global-parameter.js';
import {
  JenvAddParameter,
  JAVA_VERSION_INTEGER,
} from './java-versions-parameter.js';
import Schema from './jenv-schema.json';

export interface JenvConfig extends ResourceConfig {
  add?: string[],
  global?: string,
}

export class JenvResource extends Resource<JenvConfig> {
  getSettings(): ResourceSettings<JenvConfig> {
    return {
      id: 'jenv',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      dependencies: Utils.isMacOS() ? ['homebrew'] : [],
      parameterSettings: {
        add: { type: 'stateful', definition: new JenvAddParameter(), order: 1 },
        global: { type: 'stateful', definition: new JenvGlobalParameter(), order: 2 },
      },
    };
  }

  override async validate(parameters: Partial<JenvConfig>): Promise<void> {
    if (parameters.add) {
      for (const version of parameters.add) {
        if (version.startsWith('/opt/homebrew/Cellar/openjdk@')) {
          continue;
        }

        if (JAVA_VERSION_INTEGER.test(version)) {
          continue;
        }

        // if (!fs.existsSync(version)) {
        //   throw new Error(`Path does not exist. ${version} cannot be found on the file system`)
        // }
      }
    }
  }

  override async refresh(): Promise<Partial<JenvConfig> | null> {
    const $ = getPty();

    const jenvQuery = await $.spawnSafe('which jenv')
    if (jenvQuery.status === SpawnStatus.ERROR) {
      return null
    }

    // For some reason jenv doctor will return with a non-zero status code even
    // if it's successful. We can ignore the status code and only check for the text
    const jenvDoctor = await $.spawnSafe('jenv doctor')
    if (jenvDoctor.data.includes('Jenv is not loaded in')) {
      return null
    }

    return {};
  }

  override async create(): Promise<void> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      await this.assertBrewInstalled()

      const jenvQuery = await $.spawnSafe('which jenv', { interactive: true })
      if (jenvQuery.status === SpawnStatus.ERROR) {
        await $.spawn('brew install jenv', { interactive: true })
      }
    } else {
      const jenvQuery = await $.spawnSafe('which jenv', { interactive: true })
      if (jenvQuery.status === SpawnStatus.ERROR) {
        const result = await $.spawnSafe('git clone https://github.com/jenv/jenv.git ~/.jenv', { interactive: true })
        if (result.status === SpawnStatus.ERROR && !result.data.includes('already exists and is not an empty directory.')) {
          throw new Error(result.data);
        }
      }
    }

    const jenvDoctor = await $.spawnSafe('jenv doctor', { interactive: true })
    if (jenvDoctor.data.includes('Jenv is not loaded in') || jenvDoctor.status === SpawnStatus.ERROR) {
      await FileUtils.addToStartupFile('export PATH="$HOME/.jenv/bin:$PATH"')
      await FileUtils.addToStartupFile('eval "$(jenv init -)"')

      await $.spawn('eval "$(jenv init -)"', { interactive: true })
      await $.spawn('jenv enable-plugin export', { interactive: true })
    }
  }

  override async destroy(): Promise<void> {
    const $ = getPty();
    await $.spawn('rm -rf $HOME/.jenv');

    await FileUtils.removeLineFromStartupFile('export PATH="$HOME/.jenv/bin:$PATH"')
    await FileUtils.removeLineFromStartupFile('eval "$(jenv init -)"')
  }

  private async assertBrewInstalled(): Promise<void> {
    const $ = getPty();
    const brewCheck = await $.spawnSafe('which brew', { interactive: true });
    if (brewCheck.status === SpawnStatus.ERROR) {
      throw new Error(
        `Homebrew is not installed. Cannot install jenv without Homebrew installed.

Brew can be installed using Codify:
{
  "type": "homebrew",
}`
      );
    }
  }
}
