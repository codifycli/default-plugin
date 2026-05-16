import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { RustConfig } from './rust-resource.js';

function packageName(pkg: string): string {
  const atIndex = pkg.lastIndexOf('@');
  return atIndex > 0 ? pkg.slice(0, atIndex) : pkg;
}

function packageVersion(pkg: string): string | undefined {
  const atIndex = pkg.lastIndexOf('@');
  return atIndex > 0 ? pkg.slice(atIndex + 1) : undefined;
}

function parseCargoList(output: string): string[] {
  return output
    .split('\n')
    .filter((line) => /^\S+\s+v[\d.]+.*:$/.test(line.trim()))
    .map((line) => {
      const match = line.trim().match(/^(\S+)\s+v([\d.]+[^\s:]*):/);
      return match ? `${match[1]}@${match[2]}` : null;
    })
    .filter((x): x is string => x !== null);
}

export class CargoPackagesParameter extends StatefulParameter<RustConfig, string[]> {
  getSettings(): ParameterSetting {
    return {
      type: 'array',
      isElementEqual: this.isEqual,
      filterInStatelessMode: (desired, current) =>
        current.filter((c) => desired.some((d) => packageName(d) === packageName(c))),
    };
  }

  async refresh(): Promise<string[] | null> {
    const $ = getPty();
    const { data } = await $.spawnSafe('cargo install --list', { interactive: true });
    if (!data) return [];
    return parseCargoList(data);
  }

  async add(valuesToAdd: string[]): Promise<void> {
    await this.install(valuesToAdd);
  }

  async modify(newValue: string[], previousValue: string[], plan: Plan<RustConfig>): Promise<void> {
    const toInstall = newValue.filter((n) => !previousValue.some((p) => packageName(n) === packageName(p)));
    const toUninstall = previousValue.filter((p) => !newValue.some((n) => packageName(n) === packageName(p)));

    if (plan.isStateful && toUninstall.length > 0) {
      await this.uninstall(toUninstall);
    }
    await this.install(toInstall);
  }

  async remove(valuesToRemove: string[]): Promise<void> {
    await this.uninstall(valuesToRemove);
  }

  private async install(packages: string[]): Promise<void> {
    if (packages.length === 0) return;
    const $ = getPty();
    for (const pkg of packages) {
      const name = packageName(pkg);
      const version = packageVersion(pkg);
      const versionFlag = version ? ` --version ${version}` : '';
      await $.spawn(`cargo install${versionFlag} ${name}`, { interactive: true });
    }
  }

  private async uninstall(packages: string[]): Promise<void> {
    if (packages.length === 0) return;
    const $ = getPty();
    await $.spawn(`cargo uninstall ${packages.map(packageName).join(' ')}`, { interactive: true });
  }

  isEqual(desired: string, current: string): boolean {
    if (!desired.includes('@')) {
      return packageName(desired) === packageName(current);
    }
    return desired === current;
  }
}
