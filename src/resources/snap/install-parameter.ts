import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { SnapConfig } from './snap.js';

export interface SnapPackage {
  name: string;
  channel?: string;
  classic?: boolean;
}

export class SnapInstallParameter extends StatefulParameter<SnapConfig, Array<SnapPackage | string>> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      filterInStatelessMode: (desired, current) =>
        current.filter((c) => desired.some((d) => this.isSamePackage(d, c))),
      isElementEqual: this.isEqual,
    }
  }

  async refresh(desired: Array<SnapPackage | string> | null, _config: Partial<SnapConfig>): Promise<Array<SnapPackage | string> | null> {
    const $ = getPty()
    const { data: installed } = await $.spawnSafe('snap list --unicode=never');

    if (!installed || installed === '') {
      return null;
    }

    const r = installed.split(/\n/)
      .filter(Boolean)
      .slice(1) // Skip header line
      .map((l) => {
        const parts = l.split(/\s+/).filter(Boolean);
        const name = parts[0];
        const channel = parts[3]; // Channel is the 4th column

        return { name, channel }
      })
      .filter((pkg) =>
        // Only return packages that are in the desired list
        desired?.some((d) => {
          if (typeof d === 'string') {
            return d === pkg.name;
          }

          return d.name === pkg.name;
        })
      )
      .map((installed) => {
        if (desired?.find((d) => typeof d === 'string' && d === installed.name)) {
          return installed.name;
        }

        const desiredPkg = desired?.find((d) => typeof d === 'object' && d.name === installed.name);
        if (desiredPkg && typeof desiredPkg === 'object' && !desiredPkg.channel && !desiredPkg.classic) {
          return { name: installed.name }
        }

        return installed;
      })

    return r.length > 0 ? r : null;
  }

  async add(valueToAdd: Array<SnapPackage | string>, _plan: Plan<SnapConfig>): Promise<void> {
    await this.install(valueToAdd);
  }

  async modify(newValue: (SnapPackage | string)[], previousValue: (SnapPackage | string)[], _plan: Plan<SnapConfig>): Promise<void> {
    const valuesToAdd = newValue.filter((n) => !previousValue.some((p) => this.isSamePackage(n, p)));
    const valuesToRemove = previousValue.filter((p) => !newValue.some((n) => this.isSamePackage(n, p)));

    if (_plan.isStateful) {
      await this.uninstall(valuesToRemove);
    }
    await this.install(valuesToAdd);
  }

  async remove(valueToRemove: (SnapPackage | string)[], _plan: Plan<SnapConfig>): Promise<void> {
    await this.uninstall(valueToRemove);
  }

  private async install(packages: Array<SnapPackage | string>): Promise<void> {
    if (!packages || packages.length === 0) {
      return;
    }

    const $ = getPty();

    // Install packages one by one since snap doesn't support batch installation
    for (const p of packages) {
      let command = 'snap install';

      if (typeof p === 'string') {
        command += ` ${p}`;
      } else {
        command += ` ${p.name}`;

        if (p.channel) {
          command += ` --channel=${p.channel}`;
        }

        if (p.classic) {
          command += ' --classic';
        }
      }

      await $.spawn(command, { requiresRoot: true, interactive: true, env: { SNAP_QUIET: 1 } });
    }
  }

  private async uninstall(packages: Array<SnapPackage | string>): Promise<void> {
    if (!packages || packages.length === 0) {
      return;
    }

    const $ = getPty();

    // Uninstall packages one by one
    for (const p of packages) {
      const name = typeof p === 'string' ? p : p.name;
      await $.spawn(`snap remove ${name}`, { requiresRoot: true, interactive: true, env: { SNAP_QUIET: 1 } });
    }
  }

  isSamePackage(a: SnapPackage | string, b: SnapPackage | string): boolean {
    if (typeof a === 'string' || typeof b === 'string') {
      if (typeof a === 'string' && typeof b === 'string') {
        return a === b;
      }

      if (typeof a === 'string' && typeof b === 'object') {
        return a === b.name;
      }

      if (typeof a === 'object' && typeof b === 'string') {
        return a.name === b;
      }
    }

    if (typeof a === 'object' && typeof b === 'object') {
      return a.name === b.name;
    }

    return false;
  }

  isEqual(desired: SnapPackage | string, current: SnapPackage | string): boolean {
    if (typeof desired === 'string' || typeof current === 'string') {
      if (typeof desired === 'string' && typeof current === 'string') {
        return desired === current;
      }

      if (typeof desired === 'string' && typeof current === 'object') {
        return desired === current.name;
      }

      if (typeof desired === 'object' && typeof current === 'string') {
        return desired.name === current;
      }
    }

    if (typeof desired === 'object' && typeof current === 'object') {
      // For snap, we only check name equality since channel can change
      // and classic is an installation flag, not a state
      return desired.name === current.name;
    }

    return false;
  }
}
