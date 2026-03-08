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

  async refresh(): Promise<Array<TartCloneItem> | null> {
    const $ = getPty();

    // List all available VMs in JSON format
    const { status, data } = await $.spawnSafe('tart list --format json', { interactive: true });
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
