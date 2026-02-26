import { ArrayStatefulParameter, Plan, SpawnStatus, getPty } from '@codifycli/plugin-core';

import { TartConfig } from './tart.js';

export interface TartLoginItem {
  host: string;
  password: string;
  username: string;
}

export class TartLoginParameter extends ArrayStatefulParameter<TartConfig, TartLoginItem | string> {
  async refresh(desired: Array<TartLoginItem | string> | null): Promise<Array<TartLoginItem | string> | null> {
    const $ = getPty();

    if (!desired || desired.length === 0) {
      return null;
    }

    // Check if we're logged in to the registries
    // We'll assume login is successful if we can run tart commands
    // TODO: THis is not right. We'll find another solution later.
    const { status } = await $.spawnSafe('tart --help 2>&1 | head -1');

    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    // Return the desired logins (we can't easily verify actual login state without credentials)
    return desired;
  }

  async addItem(item: TartLoginItem | string, _plan: Plan<TartConfig>): Promise<void> {
    const pty = getPty();

    // Simple host - will prompt for credentials interactively, or login with credentials
    const command = typeof item === 'string'
      ? `tart login ${item}`
      : `tart login ${item.host} --username ${item.username} --password ${item.password}`;
    await pty.spawn(command, { interactive: true });
  }

  async removeItem(item: TartLoginItem | string, _plan: Plan<TartConfig>): Promise<void> {
    const pty = getPty();

    const host = typeof item === 'string' ? item : item.host;
    // tart logout command
    await pty.spawn(`tart logout ${host}`, { interactive: true });
  }
}
