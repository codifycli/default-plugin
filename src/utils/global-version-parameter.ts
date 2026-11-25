import { ParameterSetting, Plan, StatefulParameter } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';

import { VersionsParameter } from './versions-parameter.js';

/**
 * Base class for a version manager's global / default version parameter (`nvm alias default`, `pyenv global`, ...).
 *
 * Accepts the same `latest` / `lts` keywords as the sibling versions list and resolves them through it, so both
 * parameters always agree on what a keyword means. The concrete version is what gets passed to the CLI.
 *
 * Pass `{ interactive: true }` to every spawn in readGlobal / setGlobal so the version manager is on PATH outside
 * of refresh.
 */
export abstract class GlobalVersionParameter<C extends StringIndexedObject>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StatefulParameter requires V extends C[keyof C]; the value is always a version string
  extends StatefulParameter<C, any> {
  protected constructor(protected readonly versions: VersionsParameter<C>) {
    super();
  }

  getSettings(): ParameterSetting {
    return {
      type: 'version',
    };
  }

  /** The current global version (concrete), or null if none is set. */
  protected abstract readGlobal(config: Partial<C>): Promise<null | string>;

  /** Sets the global version. Always called with a concrete version. */
  protected abstract setGlobal(version: string, config: Partial<C>): Promise<void>;

  override async refresh(desired: null | string, config: Partial<C>): Promise<null | string> {
    const current = await this.readGlobal(config);

    // A keyword converges when the global is the version that keyword currently resolves to
    if (desired && current && this.versions.isAlias(desired)
      && (await this.versions.resolveKeyword(desired, config)) === current) {
      return desired;
    }

    return current;
  }

  override async add(valueToAdd: string, plan: Plan<C>): Promise<void> {
    await this.resolveAndSet(valueToAdd, plan);
  }

  override async modify(newValue: string, _previousValue: string, plan: Plan<C>): Promise<void> {
    await this.resolveAndSet(newValue, plan);
  }

  private async resolveAndSet(value: string, plan: Plan<C>): Promise<void> {
    const config = plan.desiredConfig ?? {};
    const version = await this.versions.resolveKeyword(value, config);
    if (!version) {
      throw new Error(`Unable to resolve "${value}" to a version.`);
    }

    await this.setGlobal(version, config);
  }
}
