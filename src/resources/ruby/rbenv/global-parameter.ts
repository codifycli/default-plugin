import { getPty, SpawnStatus } from '@codifycli/plugin-core';

import { GlobalVersionParameter } from '../../../utils/global-version-parameter.js';
import { RubyVersionsParameter } from './ruby-versions-parameter.js';
import { RbenvConfig } from './rbenv.js';

export class RbenvGlobalParameter extends GlobalVersionParameter<RbenvConfig> {
  constructor() {
    super(new RubyVersionsParameter());
  }

  protected async readGlobal(): Promise<null | string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('rbenv global', { interactive: true });
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return parseGlobalVersion(data);
  }

  protected async setGlobal(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`rbenv global ${version}`, { interactive: true });
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('rbenv global system', { interactive: true });
  }
}

/** Returns null when rbenv reports "system" (no user-managed version set). */
function parseGlobalVersion(output: string): null | string {
  const version = output.trim();
  return version === 'system' ? null : version;
}
