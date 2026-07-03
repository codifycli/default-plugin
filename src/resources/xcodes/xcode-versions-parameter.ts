import { ArrayStatefulParameter, Plan, getPty } from '@codifycli/plugin-core';

import { XcodesConfig } from './xcodes-resource.js';

export class XcodeVersionsParameter extends ArrayStatefulParameter<XcodesConfig, string> {
  override async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();
    const { data } = await $.spawnSafe('xcodes installed');
    return parseInstalledVersions(data);
  }

  override async addItem(version: string, plan: Plan<XcodesConfig>): Promise<void> {
    const $ = getPty();
    const { appleId, appleIdPassword } = plan.desiredConfig ?? {};

    const env: Record<string, string> = {};
    if (appleId) env['XCODES_USERNAME'] = appleId;
    if (appleIdPassword) env['XCODES_PASSWORD'] = appleIdPassword;

    await $.spawn(`xcodes install "${version}"`, {
      interactive: true,
      stdin: true,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`xcodes uninstall "${version}"`, { interactive: true });
  }
}

function parseInstalledVersions(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?)\s+\([^)]+\)/);
      return match ? match[1].trim() : null;
    })
    .filter((v): v is string => v !== null);
}
