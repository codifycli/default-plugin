import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { NpmConfig } from './npm.js';

export interface NpmPackage {
  name: string;
  version?: string;
}

interface NpmLsResponse {
  version: string;
  name: string;
  dependencies?: Record<string, {
    version: string;
    resolved: string;
    overridden: boolean;
  }>;
}

export class NpmGlobalInstallParameter extends StatefulParameter<NpmConfig, Array<NpmPackage | string>> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      isElementEqual: this.isEqual,
      filterInStatelessMode: (desired, current) =>
        current.filter((c) => desired.some((d) => this.isSamePackage(d, c))),
    }
  }

  async refresh(desired: (NpmPackage | string)[] | null, config: Partial<NpmConfig>): Promise<(NpmPackage | string)[] | null> {
    const pty = getPty();

    const { data } = await pty.spawnSafe('npm ls --json --global --depth=0 --loglevel=silent')
    if (!data) {
      return null;
    }

    const parsedData = JSON.parse(data) as NpmLsResponse;
    const dependencies = Object.entries(parsedData.dependencies ?? {})
      .map(([name, info]) => ({
        name,
        version: info.version,
      }))

    return dependencies.map((c) => {
      if (desired?.some((d) => typeof d === 'string' && d === c.name)) {
        return c.name;
      }

      if(desired?.some((d) => typeof d === 'object' && d.name === c.name && !d.version)) {
        return { name: c.name };
      }

      return c;
    })
  }

  async add(valueToAdd: Array<NpmPackage | string>, plan: Plan<NpmConfig>): Promise<void> {
    await this.install(valueToAdd);
  }

  async modify(newValue: (NpmPackage | string)[], previousValue: (NpmPackage | string)[], plan: Plan<NpmConfig>): Promise<void> {
    const toInstall = newValue.filter((n) => !previousValue.some((p) => this.isSamePackage(n, p)));
    const toUninstall = previousValue.filter((p) => !newValue.some((n) => this.isSamePackage(n, p)));

    if (plan.isStateful && toUninstall.length > 0) {
      await this.uninstall(toUninstall);
    }
    await this.install(toInstall);
  }

  async remove(valueToRemove: (NpmPackage | string)[], plan: Plan<NpmConfig>): Promise<void> {
    await this.uninstall(valueToRemove);
  }

  async install(packages: Array<NpmPackage | string>): Promise<void> {
    const $ = getPty();
    const installStatements = packages.map((p) => {
      if (typeof p === 'string') {
        return p;
      }

      if (p.version) {
        return `${p.name}@${p.version}`;
      }

      return p.name;
    })

    if (installStatements.length === 0) {
      return;
    }

    await $.spawn(`npm install --global ${installStatements.join(' ')}`, { interactive: true });
  }

  async uninstall(packages: Array<NpmPackage | string>): Promise<void> {
    const $ = getPty();
    const uninstallStatements = packages.map((p) => {
      if (typeof p === 'string') {
        return p;
      }

      return p.name;
    })

    if (uninstallStatements.length === 0) {
      return;
    }

    await $.spawn(`npm uninstall --global ${uninstallStatements.join(' ')}`, { interactive: true });
  }


  isSamePackage(desired: NpmPackage | string, current: NpmPackage | string): boolean {
    if (typeof desired === 'string' && typeof current === 'string') {
      return desired === current;
    }

    if (typeof desired === 'object' && typeof current === 'object') {
      return desired.name === current.name;
    }

    return false;
  }

  isEqual(desired: NpmPackage | string, current: NpmPackage | string): boolean {
    if (typeof desired === 'string' && typeof current === 'string') {
      return desired === current;
    }

    if (typeof desired === 'object' && typeof current === 'object') {
      return desired.version
        ? desired.name === current.name && desired.version === current.version
        : desired.name === current.name;
    }

    return false;
  }

}
