import { ParameterSetting, Plan, SpawnStatus, StatefulParameter, Utils, getPty } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';
import path from 'node:path';

const VSCODE_APPLICATION_NAME = 'Visual Studio Code.app';

export function getCodeBinary(directory?: string | null): string {
  if (Utils.isMacOS()) {
    // On macOS the code binary lives inside the app bundle. Use the full path so it
    // works immediately after install without requiring a new shell session.
    return path.join(
      directory ?? '/Applications',
      VSCODE_APPLICATION_NAME,
      'Contents', 'Resources', 'app', 'bin', 'code',
    );
  }
  // On Linux, the package manager installs code to /usr/bin/code (already on PATH).
  return 'code';
}

/** Configs with a list of VS Code extensions, and optionally the directory VS Code is installed in (macOS). */
type ExtensionsConfig = StringIndexedObject & { directory?: string | null; extensions?: string[] };

/**
 * Installs VS Code extensions. In the default (declarative) mode only the listed extensions are managed: the framework
 * filters the installed extensions down to the declared ones, so other installed extensions are never uninstalled.
 */
export class ExtensionsParameter extends StatefulParameter<ExtensionsConfig, string[]> {
  getSettings(): ParameterSetting {
    return {
      type: 'array',
      isElementEqual(desired, current) {
        return desired.toLowerCase() === current.toLowerCase();
      },
    };
  }

  override async refresh(desired: string[] | null, config: Partial<ExtensionsConfig>): Promise<string[] | null> {
    const $ = getPty();
    const code = getCodeBinary(config.directory);
    const result = await $.spawnSafe(`"${code}" --list-extensions`);
    if (result.status !== SpawnStatus.SUCCESS || result.data == null) {
      return null;
    }
    return result.data.split('\n').filter(Boolean);
  }

  async add(valueToAdd: string[], plan: Plan<ExtensionsConfig>): Promise<void> {
    const $ = getPty();
    const code = getCodeBinary(plan.desiredConfig?.directory);
    for (const ext of valueToAdd) {
      await $.spawn(`"${code}" --install-extension ${ext} --force`, { interactive: true });
    }
  }

  async modify(newValue: string[], previousValue: string[], plan: Plan<ExtensionsConfig>): Promise<void> {
    const toAdd = newValue.filter((n) => !previousValue.some((p) => p.toLowerCase() === n.toLowerCase()));
    const toRemove = previousValue.filter((p) => !newValue.some((n) => n.toLowerCase() === p.toLowerCase()));
    await this.remove(toRemove, plan);
    await this.add(toAdd, plan);
  }

  async remove(valueToRemove: string[], plan: Plan<ExtensionsConfig>): Promise<void> {
    const $ = getPty();
    const code = getCodeBinary(plan.desiredConfig?.directory ?? plan.currentConfig?.directory);
    for (const ext of valueToRemove) {
      await $.spawnSafe(`"${code}" --uninstall-extension ${ext}`);
    }
  }
}
