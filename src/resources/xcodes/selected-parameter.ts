import { getPty, ParameterSetting, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { XcodesConfig } from './xcodes-resource.js';

export class XcodesSelectedParameter extends StatefulParameter<XcodesConfig, string> {
  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  override async refresh(): Promise<string | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('xcodes installed');
    if (status === SpawnStatus.ERROR) return null;
    return parseSelectedVersion(data);
  }

  override async add(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`xcodes select "${version}"`, { interactive: true, stdin: true });
  }

  override async modify(newVersion: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`xcodes select "${newVersion}"`, { interactive: true, stdin: true });
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('xcode-select --reset', { requiresRoot: true });
  }
}

function parseSelectedVersion(output: string): string | null {
  for (const line of output.split('\n')) {
    if (line.includes('Selected')) {
      const match = line.trim().match(/^(.+?)\s+\([^)]+\)/);
      return match ? match[1].trim() : null;
    }
  }
  return null;
}
