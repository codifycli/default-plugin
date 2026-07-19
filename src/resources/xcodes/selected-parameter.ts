import { getPty, ParameterSetting, Plan, SpawnStatus, StatefulParameter } from '@codifycli/plugin-core';

import { XcodesConfig } from './xcodes-resource.js';
import { LATEST_VERSION_KEYWORD, resolveInstalledVersion } from './xcodes-utils.js';

export class XcodesSelectedParameter extends StatefulParameter<XcodesConfig, string> {
  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  override async refresh(desired: string | null): Promise<string | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('xcodes installed');
    if (status === SpawnStatus.ERROR) return null;
    const selected = parseSelectedVersion(data);

    // "latest" isn't a real xcode-select target — normalize the currently selected
    // version back to the literal "latest" when it's also the newest installed
    // version, so a desired value of "latest" converges instead of diffing forever.
    if (desired === LATEST_VERSION_KEYWORD && selected) {
      const newestInstalled = await resolveInstalledVersion(LATEST_VERSION_KEYWORD);
      if (selected === newestInstalled) return LATEST_VERSION_KEYWORD;
    }

    return selected;
  }

  override async add(version: string, plan: Plan<XcodesConfig>): Promise<void> {
    const $ = getPty();
    const resolved = await resolveInstalledVersion(version);
    if (!resolved) throw new Error(`Unable to resolve xcode version "${version}" to select. Ensure it is listed in xcodeVersions.`);
    await $.spawn(`xcodes select "${resolved}"`, { interactive: true, stdin: true });
    await this.acceptLicenseIfNeeded(plan);
  }

  override async modify(newVersion: string, _previousVersion: string, plan: Plan<XcodesConfig>): Promise<void> {
    const $ = getPty();
    const resolved = await resolveInstalledVersion(newVersion);
    if (!resolved) throw new Error(`Unable to resolve xcode version "${newVersion}" to select. Ensure it is listed in xcodeVersions.`);
    await $.spawn(`xcodes select "${resolved}"`, { interactive: true, stdin: true });
    await this.acceptLicenseIfNeeded(plan);
  }

  override async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('xcode-select --reset', { requiresRoot: true });
  }

  // xcodes select only ever selects a fully-installed Xcode.app (never a
  // CommandLineTools-only instance, which xcodes doesn't track), so once select
  // succeeds above, xcode-select is guaranteed to point at a full Xcode and
  // xcodebuild -license accept can run safely.
  private async acceptLicenseIfNeeded(plan: Plan<XcodesConfig>): Promise<void> {
    if (plan.desiredConfig?.acceptLicense === false) return;

    const $ = getPty();
    const { status } = await $.spawnSafe('xcodebuild -license status');
    if (status === SpawnStatus.SUCCESS) return;
    await $.spawn('xcodebuild -license accept', { requiresRoot: true });
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
