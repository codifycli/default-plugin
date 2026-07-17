import { ArrayStatefulParameter, Plan, SpawnStatus, getPty } from '@codifycli/plugin-core';

import { XcodesConfig } from './xcodes-resource.js';

export class XcodeVersionsParameter extends ArrayStatefulParameter<XcodesConfig, string> {
  override async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();
    const { data } = await $.spawnSafe('xcodes installed');
    return parseInstalledVersions(data);
  }

  override async addItem(version: string, plan: Plan<XcodesConfig>): Promise<void> {
    const $ = getPty();
    const { appleId, appleIdPassword, acceptLicense } = plan.desiredConfig ?? {};

    const env: Record<string, string> = {};
    if (appleId) env['XCODES_USERNAME'] = appleId;
    if (appleIdPassword) env['XCODES_PASSWORD'] = appleIdPassword;

    await $.spawn(`xcodes install "${version}"`, {
      interactive: true,
      stdin: true,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    });

    if (acceptLicense !== false) {
      await this.acceptLicenseIfNeeded(version);
    }
  }

  private async acceptLicenseIfNeeded(version: string): Promise<void> {
    const $ = getPty();

    // xcodebuild resolves against whatever xcode-select currently points at. If it's
    // still pointing at a CommandLineTools-only instance (e.g. installed before xcodes
    // ran), `xcodebuild -license accept` fails with "requires Xcode" even though a full
    // Xcode was just installed above. Explicitly select the version we just installed
    // first so xcode-select points at the full Xcode.
    await $.spawn(`xcodes select "${version}"`, { interactive: true, stdin: true });

    const { status } = await $.spawnSafe('xcodebuild -license status');
    if (status === SpawnStatus.SUCCESS) return;
    await $.spawn('xcodebuild -license accept', { requiresRoot: true });
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
