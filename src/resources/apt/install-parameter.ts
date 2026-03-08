import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { AptConfig } from './apt.js';

export interface AptPackage {
  name: string;
  version?: string;
}

export class AptInstallParameter extends StatefulParameter<AptConfig, Array<AptPackage | string>> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      filterInStatelessMode: (desired, current) =>
        current.filter((c) => desired.some((d) => this.isSamePackage(d, c))),
      isElementEqual: this.isEqual,
    }
  }

  async refresh(desired: Array<AptPackage | string> | null, _config: Partial<AptConfig>): Promise<Array<AptPackage | string> | null> {
    const $ = getPty()
    const { data: installed } = await $.spawnSafe('dpkg-query -W -f=\'${Package} ${Version}\\n\'');

    if (!installed || installed === '') {
      return null;
    }

    const r = installed.split(/\n/)
      .filter(Boolean)
      .map((l) => {
        const [name, version] = l.split(/\s+/)
          .filter(Boolean)

        return { name, version }
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

        if (desired?.find((d) => typeof d === 'object' && d.name === installed.name && !d.version)) {
          return { name: installed.name }
        }

        return installed;
      })

    return r.length > 0 ? r : null;
  }

  async add(valueToAdd: Array<AptPackage | string>, plan: Plan<AptConfig>): Promise<void> {
    await this.updateIfNeeded(plan);
    await this.install(valueToAdd);
  }

  async modify(newValue: (AptPackage | string)[], previousValue: (AptPackage | string)[], plan: Plan<AptConfig>): Promise<void> {
    const valuesToAdd = newValue.filter((n) => !previousValue.some((p) => this.isSamePackage(n, p)));
    const valuesToRemove = previousValue.filter((p) => !newValue.some((n) => this.isSamePackage(n, p)));

    await this.uninstall(valuesToRemove);
    await this.updateIfNeeded(plan);
    await this.install(valuesToAdd);
  }

  async remove(valueToRemove: (AptPackage | string)[], _plan: Plan<AptConfig>): Promise<void> {
    await this.uninstall(valueToRemove);
  }

  private async updateIfNeeded(plan: Plan<AptConfig>): Promise<void> {
    if (plan.desiredConfig?.update === false) {
      return;
    }

    const $ = getPty();
    await $.spawn('apt-get update', { requiresRoot: true, interactive: true });
  }

  private async install(packages: Array<AptPackage | string>): Promise<void> {
    if (!packages || packages.length === 0) {
      return;
    }

    const $ = getPty();
    const toInstall = packages.map((p) => {
      if (typeof p === 'string') {
        return p;
      }

      if (p.version) {
        return `${p.name}=${p.version}`;
      }

      return p.name;
    }).join(' ');

    await $.spawn(`apt-get install -y ${toInstall}`, {
      requiresRoot: true,
      env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' }
    });
  }

  private async uninstall(packages: Array<AptPackage | string>): Promise<void> {
    if (!packages || packages.length === 0) {
      return;
    }

    const $ = getPty();
    const toUninstall = packages.map((p) => {
      if (typeof p === 'string') {
        return p;
      }

      return p.name;
    }).join(' ');

    await $.spawn(`apt-get auto-remove -y  ${toUninstall}`, { requiresRoot: true, env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' }});
  }

  isSamePackage(a: AptPackage | string, b: AptPackage | string): boolean {
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

  isEqual(desired: AptPackage | string, current: AptPackage | string): boolean {
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
      return desired.version
        ? desired.version === current.version && desired.name === current.name
        : desired.name === current.name;
    }

    return false;
  }
}
