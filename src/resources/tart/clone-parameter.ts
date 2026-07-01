import { ArrayParameterSetting, ArrayStatefulParameter, Plan, SpawnStatus, getPty } from '@codifycli/plugin-core';

import { TartConfig } from './tart.js';

interface TartCloneItem {
  name: string;
  sourceName: string;
}

export class TartCloneParameter extends ArrayStatefulParameter<TartConfig, TartCloneItem> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      isElementEqual: (a: TartCloneItem, b: TartCloneItem) => a.name === b.name,
    }
  }

  async refresh(desired: Array<TartCloneItem> | null): Promise<Array<TartCloneItem> | null> {
    const $ = getPty();

    // List all available VMs in JSON format
    const { status, data } = await $.spawnSafe('tart list --format json', { interactive: true });

    // A non-zero exit can mean two very different things, and exit code alone can't
    // distinguish them — so we parse the output:
    //   1. Tart isn't installed / has nothing to report -> the resource doesn't exist (null).
    //   2. Tart failed to *access* its storage -> a real error we must not swallow.
    // The most common #2 is macOS blocking access to the TART_HOME directory (e.g. an
    // external/removable volume without Full Disk Access), which surfaces as
    // "Operation not permitted" / "you don't have permission to view it" even though the
    // Unix permissions are fine. Silently returning null there makes Codify believe
    // declared VMs are missing and offer to re-clone them.
    const permissionDenied = /operation not permitted|don.?t have permission|permission to view/i.test(data ?? '');
    if (permissionDenied) {
      const tartHome = process.env.TART_HOME;
      throw new Error(
        `Failed to list Tart VMs — macOS denied access to Tart's storage`
        + (tartHome ? ` (TART_HOME="${tartHome}")` : '')
        + `.\n\n${data}\n\n`
        + `If TART_HOME points at an external or removable volume, grant the app running `
        + `Codify (your terminal and/or the Codify desktop app) access under System Settings `
        + `→ Privacy & Security → Files and Folders (Removable Volumes) or Full Disk Access, `
        + `then restart the app.`
      );
    }

    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    // Parse the JSON output to get the list of VMs
    let vms: string[] = [];
    try {
      const vmList = JSON.parse(data);
      vms = vmList.map((vm: { Name: string }) => vm.Name);
    } catch {
      // If JSON parsing fails, return null
      return null;
    }

    return vms.map(name => ({ name, sourceName: name }));
  }

  async addItem(item: TartCloneItem, _plan: Plan<TartConfig>): Promise<void> {
    const pty = getPty();

    // Clone directly - the name will be derived from the source, or clone with custom name
    const command = `tart clone ${item.sourceName} ${item.name}`;
    await pty.spawn(command, { interactive: true });
  }

  async removeItem(item: TartCloneItem, _plan: Plan<TartConfig>): Promise<void> {
    const pty = getPty();

    const vmName = item.name;
    await pty.spawn(`tart delete ${vmName}`, { interactive: true });
  }
}
