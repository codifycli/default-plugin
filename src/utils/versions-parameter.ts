import { ArrayStatefulParameter, ParameterSetting, Plan } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';

import {
  isClaimedBy,
  isVersionAlias,
  normalizeVersions,
  VersionAlias,
  VersionMatches,
} from './version-aliases.js';

/**
 * Base class for the "list of installed versions" parameter of a version manager (nvm, fnm, pyenv, rbenv, goenv,
 * asdf, xcodes). It implements the `latest` / `lts` keywords once so that subclasses only describe how to talk to
 * their CLI.
 *
 * Subclasses implement:
 * - {@link listInstalled}: concrete installed versions
 * - {@link resolveAlias}: the concrete version a keyword currently points to (the newest available release, falling
 *   back to installed versions when the remote can't be reached)
 * - {@link installVersion} / {@link uninstallVersion}: always called with concrete versions, never a keyword
 * - optionally {@link matchInstalled} for partial matching (`22` → `22.11.0`)
 *
 * The lookups (listInstalled, resolveAlias, matchInstalled) also run during apply, where the shell RC is not sourced
 * automatically: pass `{ interactive: true }` to every spawn in them or the version manager won't be on PATH.
 */
export abstract class VersionsParameter<C extends StringIndexedObject> extends ArrayStatefulParameter<C, string> {
  /** Keywords this version manager understands. Anything else is treated as a regular version string. */
  protected abstract readonly supportedAliases: readonly VersionAlias[];

  protected constructor(private readonly parameterKey: keyof C & string) {
    super();
  }

  getSettings(): ParameterSetting {
    return {
      type: 'array',
      // refresh() relabels installed versions with the desired entries they satisfy, so strict equality is correct.
      isElementEqual: (desired: string, current: string) => desired === current,
    };
  }

  /** Concrete installed versions, or null if none can be found (the parameter doesn't exist). */
  protected abstract listInstalled(config: Partial<C>): Promise<null | string[]>;

  /** The concrete version `alias` currently points to, or null if it can't be determined. */
  protected abstract resolveAlias(alias: VersionAlias, installed: string[], config: Partial<C>): Promise<null | string>;

  protected abstract installVersion(version: string, config: Partial<C>): Promise<void>;

  protected abstract uninstallVersion(version: string, config: Partial<C>): Promise<void>;

  /** The installed version that a desired (non keyword) entry refers to. Defaults to exact matching. */
  protected async matchInstalled(desired: string, installed: string[], _config: Partial<C>): Promise<null | string> {
    return installed.includes(desired) ? desired : null;
  }

  override async refresh(desired: null | string[], config: Partial<C>): Promise<null | string[]> {
    const installed = await this.listInstalled(config);
    if (installed === null) {
      return null;
    }

    const entries = desired ?? [];
    const matches = await this.resolveMatches(entries, installed, config);
    return normalizeVersions(installed, entries, matches);
  }

  override async addItem(item: string, plan: Plan<C>): Promise<void> {
    const config = plan.desiredConfig ?? plan.currentConfig ?? {};

    if (!this.isAlias(item)) {
      await this.installVersion(item, config);
      return;
    }

    const installed = (await this.listInstalled(config)) ?? [];
    const target = await this.resolveAlias(item, installed, config);
    if (!target) {
      throw new Error(`Unable to resolve "${item}" to a version. Check the network connection and try again.`);
    }

    if (!installed.includes(target)) {
      await this.installVersion(target, config);
    }
  }

  override async removeItem(item: string, plan: Plan<C>): Promise<void> {
    const config = plan.currentConfig ?? plan.desiredConfig ?? {};
    const installed = (await this.listInstalled(config)) ?? [];

    const remaining = ((plan.desiredConfig?.[this.parameterKey] ?? []) as string[]).filter((v) => v !== item);
    const matches = await this.resolveMatches([item, ...remaining], installed, config);

    const version = matches[item];
    if (!version) {
      console.warn(`Unable to find an installed version for "${item}". Skipping uninstall.`);
      return;
    }

    if (isClaimedBy(version, remaining, matches)) {
      console.log(`Version ${version} is still required by another entry. Skipping uninstall of "${item}".`);
      return;
    }

    await this.uninstallVersion(version, config);
  }

  /**
   * Resolves a value that may be a keyword to a concrete version (other values are returned as is). For use by
   * sibling parameters such as a global / default version so they resolve keywords exactly like the versions list.
   */
  async resolveKeyword(value: string, config: Partial<C>): Promise<null | string> {
    if (!this.isAlias(value)) {
      return value;
    }

    const installed = (await this.listInstalled(config)) ?? [];
    return this.resolveAlias(value, installed, config);
  }

  isAlias(value: string): value is VersionAlias {
    return isVersionAlias(value, this.supportedAliases);
  }

  private async resolveMatches(entries: string[], installed: string[], config: Partial<C>): Promise<VersionMatches> {
    const unique = Array.from(new Set(entries));
    const resolved = await Promise.all(unique.map(async (entry) => {
      const target = this.isAlias(entry)
        ? await this.resolveAlias(entry, installed, config)
        : await this.matchInstalled(entry, installed, config);

      // Only installed versions count as a match (an alias may point to a release that isn't installed yet).
      return [entry, target && installed.includes(target) ? target : null] as const;
    }));

    return Object.fromEntries(resolved);
  }
}
