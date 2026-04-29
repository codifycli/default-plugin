import { ParameterSetting, Plan, SpawnStatus, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { MacportsConfig } from './macports.js';

export interface PortPackage {
  name: string;
  version?: string;
}

export class MacportsInstallParameter extends StatefulParameter<MacportsConfig, Array<PortPackage | string>> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      filterInStatelessMode: (desired, current) => 
        current.filter((c) => desired.some((d) => this.isSamePackage(d, c))),
      isElementEqual: this.isEqual,
    }
  }

  async refresh(desired: Array<PortPackage | string> | null, config: Partial<MacportsConfig>): Promise<Array<PortPackage | string> | null> {
    const $ = getPty()
    const { data: installed, status } = await $.spawnSafe('port echo installed');

    if (status === SpawnStatus.ERROR || !installed || installed === '' || installed.includes('Error:')) {
      return null;
    }

    const r = installed.split(/\n/)
      .map((l) => {
        const [name, version] = l.split(/\s+/)
          .filter(Boolean)

        return { name, version }
      })
      .map((installed) => {
        if (desired?.find((d) => typeof d === 'string' && d === installed.name)) {
          return installed.name;
        }

        if (desired?.find((d) => typeof d === 'object' && d.name === installed.name && !d.version)) {
          return { name: installed.name }
        }

        return installed;
      })

    return r;
  }

  async add(valueToAdd: Array<PortPackage | string>, plan: Plan<MacportsConfig>): Promise<void> {
    await this.install(valueToAdd);
  }

  async modify(newValue: (PortPackage | string)[], previousValue: (PortPackage | string)[], plan: Plan<MacportsConfig>): Promise<void> {
    const valuesToAdd = newValue.filter((n) => !previousValue.some((p) => this.isSamePackage(n, p)));
    const valuesToRemove = previousValue.filter((p) => !newValue.some((n) => this.isSamePackage(n, p)));
    
    await this.uninstall(valuesToRemove);
    await this.install(valuesToAdd);
  }

  async remove(valueToRemove: (PortPackage | string)[], plan: Plan<MacportsConfig>): Promise<void> {
    await this.uninstall(valueToRemove);
  }

  private async install(packages: Array<PortPackage | string>): Promise<void> {
    const $ = getPty();
    const toInstall = packages.map((p) => {
      if (typeof p === 'string') {
        return p;
      }

      if (p.version) {
        return `${p.name} ${p.version}`;
      }

      return p.name;
    }).join(' ');

    await $.spawn(`port install ${toInstall}`, { requiresRoot: true, interactive: true });
  }

  private async uninstall(packages: Array<PortPackage | string>): Promise<void> {
    const $ = getPty();
    const toInstall = packages.map((p) => {
      if (typeof p === 'string') {
        return p;
      }

      return p.name;
    }).join(' ');

    await $.spawn(`port uninstall ${toInstall}`, { requiresRoot: true, interactive: true });
  }
  
  isSamePackage(a: PortPackage | string, b: PortPackage | string): boolean {
    if (typeof a === 'string' || typeof b === 'string') {
      return a === b;
    }
    
    if (typeof a === 'object' && typeof b === 'object') {
      return a.name === b.name;
    }
    
    return false;
  }
  
  isEqual(desired: PortPackage | string, current: PortPackage | string): boolean {
    if (typeof desired === 'string' || typeof current === 'string') {
      return desired === current;
    }

    if (typeof desired === 'object' && typeof current === 'object') {
      return desired.version
        ? desired.version === current.version && desired.name === current.name
        : desired.name === current.name;
    }
    
    return false;
  }


}
