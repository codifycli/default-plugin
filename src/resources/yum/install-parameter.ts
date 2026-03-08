import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { YumConfig } from './yum.js';

export interface YumPackage {
  name: string;
  version?: string;
}

export class YumInstallParameter extends StatefulParameter<YumConfig, Array<YumPackage | string>> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      filterInStatelessMode: (desired, current) =>
        current.filter((c) => desired.some((d) => this.isSamePackage(d, c))),
      isElementEqual: this.isEqual,
    }
  }

  async refresh(desired: Array<YumPackage | string> | null, _config: Partial<YumConfig>): Promise<Array<YumPackage | string> | null> {
    const $ = getPty()
    const { data: installed } = await $.spawnSafe('rpm -qa --queryformat \'%{NAME} %{VERSION}-%{RELEASE}\\n\'');

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

  async add(valueToAdd: Array<YumPackage | string>, plan: Plan<YumConfig>): Promise<void> {
    await this.updateIfNeeded(plan);
    await this.install(valueToAdd);
  }

  async modify(newValue: (YumPackage | string)[], previousValue: (YumPackage | string)[], plan: Plan<YumConfig>): Promise<void> {
    const valuesToAdd = newValue.filter((n) => !previousValue.some((p) => this.isSamePackage(n, p)));
    const valuesToRemove = previousValue.filter((p) => !newValue.some((n) => this.isSamePackage(n, p)));

    await this.uninstall(valuesToRemove);
    await this.updateIfNeeded(plan);
    await this.install(valuesToAdd);
  }

  async remove(valueToRemove: (YumPackage | string)[], _plan: Plan<YumConfig>): Promise<void> {
    await this.uninstall(valueToRemove);
  }

  private async updateIfNeeded(plan: Plan<YumConfig>): Promise<void> {
    if (plan.desiredConfig?.update === false) {
      return;
    }

    const $ = getPty();
    await $.spawnSafe('yum check-update', { requiresRoot: true, interactive: true });
  }

  private async install(packages: Array<YumPackage | string>): Promise<void> {
    if (!packages || packages.length === 0) {
      return;
    }

    const $ = getPty();
    const toInstall = packages.map((p) => {
      if (typeof p === 'string') {
        return p;
      }

      if (p.version) {
        return `${p.name}-${p.version}`;
      }

      return p.name;
    }).join(' ');

    await $.spawn(`yum install -y ${toInstall} --allowerasing`, { requiresRoot: true, interactive: true });
  }

  private async uninstall(packages: Array<YumPackage | string>): Promise<void> {
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

    await $.spawn(`yum remove -y ${toUninstall}`, { requiresRoot: true, interactive: true });
  }

  isSamePackage(a: YumPackage | string, b: YumPackage | string): boolean {
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

  isEqual(desired: YumPackage | string, current: YumPackage | string): boolean {
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
