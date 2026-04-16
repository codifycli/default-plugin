import { ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';

import { UvConfig } from './uv.js';

/**
 * uv tool list output example:
 *   ruff v0.4.4
 *       - ruff
 *   black v24.4.2
 *       - black
 *       - blackd
 *
 * We extract the tool names from lines that do NOT start with whitespace (the
 * header lines), taking everything before the first space.
 */
export class UvToolsParameter extends ArrayStatefulParameter<UvConfig, string> {
  override async refresh(desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();

    const { status, data } = await $.spawnSafe('uv tool list');
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    return parseInstalledTools(data);
  }

  override async addItem(tool: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`uv tool install ${tool}`, { interactive: true });
  }

  override async removeItem(tool: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`uv tool uninstall ${tool}`, { interactive: true });
  }
}

/** Extract tool names from the header lines of `uv tool list` output */
function parseInstalledTools(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => line.length > 0 && !/^\s/.test(line))
    .map((line) => line.split(' ')[0].trim())
    .filter(Boolean);
}
