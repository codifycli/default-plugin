import { ParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { AptConfig } from './apt.js';

// Extracts the package name without the version specifier (e.g. "nodejs=20.*" → "nodejs")
function packageName(pkg: string): string {
  const eqIndex = pkg.indexOf('=')
  return eqIndex > 0 ? pkg.slice(0, eqIndex) : pkg
}

export class AptInstallParameter extends StatefulParameter<AptConfig, string[]> {

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      filterInStatelessMode: (desired, current) =>
        current.filter((c) => desired.some((d) => packageName(d) === packageName(c))),
      isElementEqual: this.isEqual,
    }
  }

  async refresh(desired: string[] | null, _config: Partial<AptConfig>): Promise<string[] | null> {
    const $ = getPty()
    const { data: installed } = await $.spawnSafe('dpkg-query -W -f=\'${Package} ${Version}\\n\'');

    if (!installed || installed === '') {
      return null;
    }

    const r = installed.split(/\n/)
      .filter(Boolean)
      .map((l) => {
        const [name, version] = l.split(/\s+/).filter(Boolean)
        return { name, version }
      })
      .filter((pkg) => desired?.some((d) => packageName(d) === pkg.name))
      .map((pkg) => {
        // If desired entry has a version specifier, return name=version so equality checks work
        if (desired?.some((d) => d.includes('=') && packageName(d) === pkg.name)) {
          return `${pkg.name}=${pkg.version}`
        }
        return pkg.name
      })

    return r.length > 0 ? r : null;
  }

  async add(valueToAdd: string[], plan: Plan<AptConfig>): Promise<void> {
    await this.updateIfNeeded(plan);
    await this.install(valueToAdd);
  }

  async modify(newValue: string[], previousValue: string[], plan: Plan<AptConfig>): Promise<void> {
    const valuesToAdd = newValue.filter((n) => !previousValue.some((p) => packageName(n) === packageName(p)));
    const valuesToRemove = previousValue.filter((p) => !newValue.some((n) => packageName(n) === packageName(p)));

    await this.uninstall(valuesToRemove);
    await this.updateIfNeeded(plan);
    await this.install(valuesToAdd);
  }

  async remove(valueToRemove: string[], _plan: Plan<AptConfig>): Promise<void> {
    await this.uninstall(valueToRemove);
  }

  private async updateIfNeeded(plan: Plan<AptConfig>): Promise<void> {
    if (plan.desiredConfig?.update === false) {
      return;
    }

    const $ = getPty();
    await $.spawn('apt-get update', { requiresRoot: true, interactive: true });
  }

  private async install(packages: string[]): Promise<void> {
    if (!packages || packages.length === 0) {
      return;
    }

    const $ = getPty();
    await $.spawn(`apt-get -qq install -o Dpkg::Progress-Fancy=0 -y ${packages.join(' ')}`, {
      requiresRoot: true,
      env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' }
    });
  }

  private async uninstall(packages: string[]): Promise<void> {
    if (!packages || packages.length === 0) {
      return;
    }

    const $ = getPty();
    await $.spawn(`apt-get -qq auto-remove -o Dpkg::Progress-Fancy=0 -y ${packages.map(packageName).join(' ')}`, {
      requiresRoot: true,
      env: { DEBIAN_FRONTEND: 'noninteractive', NEEDRESTART_MODE: 'a' }
    });
  }

  isEqual(desired: string, current: string): boolean {
    // If no version specified in desired, match by name only
    if (!desired.includes('=')) {
      return packageName(desired) === packageName(current)
    }
    return desired === current
  }
}
