import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { NpmConfig } from './npm.js';

interface NpmLsResponse {
  version: string;
  name: string;
  dependencies?: Record<string, {
    version: string;
    resolved: string;
    overridden: boolean;
  }>;
}

// Extracts the package name without the version specifier (e.g. "nodemon@3.1.10" → "nodemon")
function packageName(pkg: string): string {
  const atIndex = pkg.lastIndexOf('@')
  return atIndex > 0 ? pkg.slice(0, atIndex) : pkg
}

export class NpmInstallParameter extends StatefulParameter<NpmConfig, string[]> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      isElementEqual: this.isEqual,
      filterInStatelessMode: (desired, current) =>
        current.filter((c) => desired.some((d) => packageName(d) === packageName(c))),
    }
  }

  async refresh(desired: string[] | null, config: Partial<NpmConfig>): Promise<string[] | null> {
    const pty = getPty();

    const { data } = await pty.spawnSafe('npm ls --json --global --depth=0 --loglevel=silent')
    if (!data) {
      return null;
    }

    const parsedData = JSON.parse(data) as NpmLsResponse;

    return Object.entries(parsedData.dependencies ?? {})
      .filter(([name]) => name !== 'corepack')
      .map(([name, info]) => {
        // If desired entry has a version specifier, return name@version so equality checks work
        if (desired?.some((d) => d.includes('@') && packageName(d) === name)) {
          return `${name}@${info.version}`
        }
        return name
      })
  }

  async add(valueToAdd: string[], plan: Plan<NpmConfig>): Promise<void> {
    await this.install(valueToAdd);
  }

  async modify(newValue: string[], previousValue: string[], plan: Plan<NpmConfig>): Promise<void> {
    const toInstall = newValue.filter((n) => !previousValue.some((p) => packageName(n) === packageName(p)));
    const toUninstall = previousValue.filter((p) => !newValue.some((n) => packageName(n) === packageName(p)));

    if (plan.isStateful && toUninstall.length > 0) {
      await this.uninstall(toUninstall);
    }
    await this.install(toInstall);
  }

  async remove(valueToRemove: string[], plan: Plan<NpmConfig>): Promise<void> {
    await this.uninstall(valueToRemove);
  }

  async install(packages: string[]): Promise<void> {
    if (packages.length === 0) {
      return;
    }
    const $ = getPty();
    await $.spawn(`npm install --global ${packages.join(' ')}`, { interactive: true });
  }

  async uninstall(packages: string[]): Promise<void> {
    if (packages.length === 0) {
      return;
    }
    const $ = getPty();
    await $.spawn(`npm uninstall --global ${packages.map(packageName).join(' ')}`, { interactive: true });
  }

  isEqual(desired: string, current: string): boolean {
    // If no version specified in desired, match by name only
    if (!desired.includes('@') || desired.startsWith('@')) {
      return packageName(desired) === packageName(current)
    }
    return desired === current
  }

}
