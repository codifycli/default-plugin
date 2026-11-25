import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { GlobalVersionParameter } from '../../../utils/global-version-parameter.js';
import { GoVersionsParameter } from './go-versions-parameter.js';
import { GoenvConfig } from './goenv.js';

export class GoenvGlobalParameter extends GlobalVersionParameter<GoenvConfig> {
  constructor() {
    super(new GoVersionsParameter());
  }

  protected async readGlobal(): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('goenv global');
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return parseGlobalVersion(data);
  }

  protected async setGlobal(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`goenv global ${version}`, { interactive: true });
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('goenv global system', { interactive: true });
  }
}

/** Returns null when goenv reports "system" (no user-managed version set). */
function parseGlobalVersion(output: string): null | string {
  const version = output.trim();
  return version === 'system' ? null : version;
}
