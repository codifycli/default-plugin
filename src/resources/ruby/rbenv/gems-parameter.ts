import { ParameterSetting, Plan, SpawnStatus, StatefulParameter, getPty } from '@codifycli/plugin-core';

type GemsConfig = { gems?: string[] } & Record<string, unknown>;

/** The gem name without its version: "apiaryio@0.20.0" -> "apiaryio" */
export function gemName(gem: string): string {
  const atIndex = gem.lastIndexOf('@');
  return atIndex > 0 ? gem.slice(0, atIndex) : gem;
}

/** The requested version, or undefined for "any version" (no version or @latest) */
export function gemVersion(gem: string): string | undefined {
  const atIndex = gem.lastIndexOf('@');
  const version = atIndex > 0 ? gem.slice(atIndex + 1) : undefined;
  return version === 'latest' ? undefined : version;
}

/** Whether an installed gem (`name@version` from refresh) satisfies a desired gem */
export function isGemEqual(desired: string, current: string): boolean {
  if (gemName(desired) !== gemName(current)) {
    return false;
  }

  const version = gemVersion(desired);
  return version === undefined || version === gemVersion(current);
}

/**
 * Parses `gem list --local` output into installed versions per gem, newest first, e.g.
 *   apiaryio (0.20.0)
 *   bundler (default: 2.5.22, 2.4.1)
 *   nokogiri (1.16.7 arm64-darwin, 1.15.0 arm64-darwin)
 */
export function parseGemList(output: string): Map<string, string[]> {
  const gems = new Map<string, string[]>();

  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(/^(\S+) \((.+)\)$/);
    if (!match) continue;

    const versions = match[2]
      .split(',')
      .map((v) => v.trim().replace(/^default:\s*/, '').split(/\s+/)[0])
      .filter(Boolean);

    if (versions.length > 0) {
      gems.set(match[1], versions);
    }
  }

  return gems;
}

/**
 * Picks one entry per installed gem for refresh. When the desired config pins a version that is installed, that version
 * is reported so the plan converges even if other versions are installed too; otherwise the newest version is reported.
 */
export function gemsToState(installed: Map<string, string[]>, desired: string[] | null): string[] {
  return Array.from(installed.entries()).map(([name, versions]) => {
    const pinned = desired
      ?.filter((d) => gemName(d) === name)
      .map(gemVersion)
      .find((v) => v !== undefined && versions.includes(v));

    return `${name}@${pinned ?? versions[0]}`;
  });
}

/**
 * Gems installed with `gem install` into rbenv's global Ruby, e.g. CLIs such as apiaryio, rails or cocoapods. Commands
 * run through `rbenv exec` so the gems go to the rbenv-managed Ruby and not the system Ruby. In the default
 * (declarative) mode only the listed gems are managed: other installed gems are left alone.
 */
export class GemsParameter extends StatefulParameter<GemsConfig, string[]> {
  getSettings(): ParameterSetting {
    return {
      type: 'array',
      isElementEqual: isGemEqual,
      filterInStatelessMode: (desired: string[], current: string[]) =>
        current.filter((c) => desired.some((d) => gemName(d) === gemName(c))),
    };
  }

  async refresh(desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('rbenv exec gem list --local', { interactive: true });
    if (status === SpawnStatus.ERROR) return null;

    return gemsToState(parseGemList(data), desired);
  }

  async add(valuesToAdd: string[]): Promise<void> {
    await this.install(valuesToAdd);
  }

  async modify(newValue: string[], previousValue: string[], plan: Plan<GemsConfig>): Promise<void> {
    const toInstall = newValue.filter((n) => !previousValue.some((p) => isGemEqual(n, p)));
    const toUninstall = previousValue.filter((p) => !newValue.some((n) => gemName(n) === gemName(p)));

    if (plan.isStateful) {
      await this.uninstall(toUninstall);
    }

    await this.install(toInstall);
  }

  async remove(valuesToRemove: string[]): Promise<void> {
    await this.uninstall(valuesToRemove);
  }

  private async install(gems: string[]): Promise<void> {
    if (gems.length === 0) return;
    const $ = getPty();

    for (const gem of gems) {
      const version = gemVersion(gem);
      const versionFlag = version ? ` --version ${version}` : '';
      await $.spawn(`rbenv exec gem install ${gemName(gem)}${versionFlag} --no-document`, { interactive: true });
    }

    // Make the gems' executables available on PATH through rbenv's shims
    await $.spawnSafe('rbenv rehash', { interactive: true });
  }

  private async uninstall(gems: string[]): Promise<void> {
    if (gems.length === 0) return;
    const $ = getPty();

    for (const gem of gems) {
      // --all: every installed version, --executables: remove binaries without asking, --ignore-dependencies: no prompt
      await $.spawnSafe(
        `rbenv exec gem uninstall ${gemName(gem)} --all --executables --ignore-dependencies`,
        { interactive: true },
      );
    }

    await $.spawnSafe('rbenv rehash', { interactive: true });
  }
}
