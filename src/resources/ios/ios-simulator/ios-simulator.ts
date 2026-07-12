import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

const simulatorSchema = z.object({
  name: z.string().describe('Name for the simulator instance (e.g. "iPhone 15 Dev")'),
  deviceType: z.string().describe('Device type identifier (e.g. "com.apple.CoreSimulator.SimDeviceType.iPhone-15")'),
  runtime: z.string().describe('Runtime identifier (e.g. "com.apple.CoreSimulator.SimRuntime.iOS-18-0")'),
});

export type SimulatorDeclaration = z.infer<typeof simulatorSchema>;

const schema = z.object({
  simulators: z
    .array(simulatorSchema)
    .optional()
    .describe('List of iOS simulators to create and manage.'),
  acceptLicense: z
    .boolean()
    .optional()
    .describe(
      'Automatically accept the Xcode license agreement if it has not been accepted yet. ' +
      'Runs `sudo xcodebuild -license accept`. Defaults to true.'
    ),
  downloadRuntimes: z
    .boolean()
    .optional()
    .describe(
      'Automatically download missing simulator runtimes via `xcodebuild -downloadPlatform`. ' +
      'Defaults to true. Set to false if you manage runtimes manually through Xcode.'
    ),
  destroyRuntimes: z
    .boolean()
    .optional()
    .describe(
      'Delete simulator runtimes that are no longer used by any simulator when this resource is destroyed. ' +
      'Defaults to false. Enable with caution — runtimes are several GB and take time to re-download.'
    ),
});

export type IosSimulatorConfig = z.infer<typeof schema>;

interface SimDevice {
  udid: string;
  name: string;
  state: string;
  deviceTypeIdentifier: string;
}

interface SimctlDevicesOutput {
  devices: Record<string, SimDevice[]>;
}

interface SimctlRuntime {
  identifier: string;
  isAvailable: boolean;
  name: string;
}

interface SimctlRuntimesOutput {
  runtimes: SimctlRuntime[];
}

const defaultConfig: Partial<IosSimulatorConfig> & { os: any } = {
  simulators: [],
  os: ['macOS'],
};

const exampleBasic: ExampleConfig = {
  title: 'iPhone 15 simulator for development',
  description: 'Create an iPhone 15 simulator running iOS 18 for use in development and UI testing.',
  configs: [{
    type: 'ios-simulators',
    simulators: [
      {
        name: 'iPhone 15 Dev',
        deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
      },
    ],
    os: ['macOS'],
  }],
};

const exampleMultiDevice: ExampleConfig = {
  title: 'iPhone and iPad simulator setup',
  description: 'Install Xcode Command Line Tools and create an iPhone and iPad simulator for cross-device testing.',
  configs: [
    { type: 'xcode-tools', os: ['macOS'] },
    {
      type: 'ios-simulators',
      simulators: [
        {
          name: 'iPhone 15 Pro',
          deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
          runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
        },
        {
          name: 'iPad Pro 11-inch',
          deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4',
          runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
        },
      ],
      os: ['macOS'],
    },
  ],
};

// com.apple.CoreSimulator.SimRuntime.iOS-18-0 → "iOS"
function runtimeToXcodebuildPlatform(runtimeId: string): string {
  const match = runtimeId.match(/SimRuntime\.([a-zA-Z]+)/);
  return match ? match[1] : runtimeId;
}

export class IosSimulatorResource extends Resource<IosSimulatorConfig> {
  getSettings(): ResourceSettings<IosSimulatorConfig> {
    return {
      id: 'ios-simulators',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleMultiDevice,
      },
      operatingSystems: [OS.Darwin],
      dependencies: ['xcode-tools'],
      schema,
      parameterSettings: {
        simulators: {
          type: 'array',
          itemType: 'object',
          isElementEqual: (a, b) =>
            a.name === b.name &&
            a.deviceType === b.deviceType &&
            a.runtime === b.runtime,
          filterInStatelessMode: (desired, current) =>
            current.filter((c) => desired.some((d) => d.name === c.name)),
          canModify: true,
        },
        acceptLicense: { type: 'boolean', setting: true, default: true },
        downloadRuntimes: { type: 'boolean', setting: true, default: true },
        destroyRuntimes: { type: 'boolean', setting: true, default: false },
      },
    };
  }

  async refresh(): Promise<Partial<IosSimulatorConfig> | null> {
    const allDevices = await this.listAllDevices();
    if (!allDevices) return null;

    const simulators: SimulatorDeclaration[] = [];
    for (const [runtimeId, devices] of Object.entries(allDevices)) {
      for (const device of devices) {
        simulators.push({
          name: device.name,
          deviceType: device.deviceTypeIdentifier,
          runtime: runtimeId,
        });
      }
    }

    return simulators.length > 0 ? { simulators } : null;
  }

  async create(plan: CreatePlan<IosSimulatorConfig>): Promise<void> {
    if (plan.desiredConfig.acceptLicense !== false) {
      await this.acceptLicenseIfNeeded();
    }
    await this.assertSimctlAvailable();
    const simulators = plan.desiredConfig.simulators ?? [];
    if (plan.desiredConfig.downloadRuntimes !== false) {
      await this.downloadMissingRuntimes(simulators);
    } else {
      await this.assertRuntimesAvailable(simulators);
    }
    const $ = getPty();
    for (const sim of simulators) {
      const { status, data } = await $.spawnSafe(
        `xcrun simctl create "${sim.name}" "${sim.deviceType}" "${sim.runtime}"`,
        { interactive: true },
      );
      if (status !== SpawnStatus.SUCCESS) {
        if (data.includes('Invalid runtime')) {
          throw new Error(
            `Runtime "${sim.runtime}" is not installed or not available.\n` +
            'Download it in Xcode → Settings → Platforms, or via:\n' +
            `  xcodebuild -downloadPlatform ${runtimeToXcodebuildPlatform(sim.runtime)}`,
          );
        }
        throw new Error(`Failed to create simulator "${sim.name}": ${data}`);
      }
    }
  }

  async modify(pc: ParameterChange<IosSimulatorConfig>, plan: ModifyPlan<IosSimulatorConfig>): Promise<void> {
    if (pc.name !== 'simulators') return;

    const $ = getPty();
    const allDevices = await this.listAllDevices();
    if (!allDevices) return;

    const findUdid = (name: string): string | undefined => {
      for (const devices of Object.values(allDevices)) {
        const match = devices.find((d) => d.name === name);
        if (match) return match.udid;
      }
    };

    const previous: SimulatorDeclaration[] = pc.previousValue ?? [];
    const desired: SimulatorDeclaration[] = pc.newValue ?? [];

    const toRemove = previous.filter((p) => !desired.some((d) => d.name === p.name));
    for (const sim of toRemove) {
      const udid = findUdid(sim.name);
      if (udid) await $.spawn(`xcrun simctl delete "${udid}"`, { interactive: true });
    }

    const toAdd = desired.filter((d) => !previous.some((p) => p.name === d.name));
    if (toAdd.length > 0 && plan.desiredConfig.downloadRuntimes !== false) {
      await this.downloadMissingRuntimes(toAdd);
    } else if (toAdd.length > 0) {
      await this.assertRuntimesAvailable(toAdd);
    }
    for (const sim of toAdd) {
      await $.spawn(
        `xcrun simctl create "${sim.name}" "${sim.deviceType}" "${sim.runtime}"`,
        { interactive: true },
      );
    }
  }

  async destroy(plan: DestroyPlan<IosSimulatorConfig>): Promise<void> {
    const $ = getPty();
    const allDevices = await this.listAllDevices();
    if (!allDevices) return;

    const simulatorsToDestroy = plan.currentConfig.simulators ?? [];
    const runtimesInUse = new Set(simulatorsToDestroy.map((s) => s.runtime));

    for (const sim of simulatorsToDestroy) {
      for (const devices of Object.values(allDevices)) {
        const match = devices.find((d) => d.name === sim.name);
        if (match) {
          await $.spawn(`xcrun simctl delete "${match.udid}"`, { interactive: true });
          break;
        }
      }
    }

    if (plan.currentConfig.destroyRuntimes) {
      await this.deleteOrphanedRuntimes(runtimesInUse);
    }
  }

  private async assertSimctlAvailable(): Promise<void> {
    const $ = getPty();
    // Use `xcrun -f simctl` to locate the binary without invoking it — avoids triggering the license prompt
    const { status } = await $.spawnSafe('xcrun -f simctl');
    if (status !== SpawnStatus.SUCCESS) {
      throw new Error(
        'xcrun simctl is not available. Xcode must be installed to manage iOS simulators. ' +
        'Install it manually from the Mac App Store or use the xcodes resource to manage Xcode versions.',
      );
    }
  }

  private async deleteOrphanedRuntimes(candidateRuntimes: Set<string>): Promise<void> {
    if (candidateRuntimes.size === 0) return;

    const allDevices = await this.listAllDevices();
    const stillInUse = new Set<string>();
    if (allDevices) {
      for (const [runtimeId, devices] of Object.entries(allDevices)) {
        if (devices.length > 0) stillInUse.add(runtimeId);
      }
    }

    const $ = getPty();
    for (const runtimeId of candidateRuntimes) {
      if (!stillInUse.has(runtimeId)) {
        await $.spawnSafe(`xcrun simctl runtime delete "${runtimeId}"`);
      }
    }
  }

  private async getMissingRuntimes(simulators: SimulatorDeclaration[]): Promise<string[]> {
    const $ = getPty();
    const { status, data } = await $.spawnSafe('xcrun simctl list runtimes --json');
    if (status !== SpawnStatus.SUCCESS) return [];

    let allRuntimes: SimctlRuntime[];
    try {
      const parsed: SimctlRuntimesOutput = JSON.parse(data);
      allRuntimes = parsed.runtimes;
    } catch {
      return [];
    }

    const availableIds = new Set(allRuntimes.filter((r) => r.isAvailable).map((r) => r.identifier));
    const requiredRuntimes = [...new Set(simulators.map((s) => s.runtime))];
    return requiredRuntimes.filter((r) => !availableIds.has(r));
  }

  private async downloadMissingRuntimes(simulators: SimulatorDeclaration[]): Promise<void> {
    const missing = await this.getMissingRuntimes(simulators);
    if (missing.length === 0) return;

    const $ = getPty();
    const platforms = [...new Set(missing.map(runtimeToXcodebuildPlatform))];
    for (const platform of platforms) {
      await $.spawn(`xcodebuild -downloadPlatform ${platform}`, { stdin: true });
    }
  }

  private async assertRuntimesAvailable(simulators: SimulatorDeclaration[]): Promise<void> {
    const missing = await this.getMissingRuntimes(simulators);
    if (missing.length === 0) return;

    const lines: string[] = [
      `The following simulator runtime${missing.length > 1 ? 's are' : ' is'} not installed or not available:`,
      ...missing.map((r) => `  ${r}`),
      'Download runtimes in Xcode → Settings → Platforms, or via:',
      ...missing.map((r) => `  xcodebuild -downloadPlatform ${runtimeToXcodebuildPlatform(r)}`),
    ];
    throw new Error(lines.join('\n'));
  }

  private async acceptLicenseIfNeeded(): Promise<void> {
    const $ = getPty();
    const { status } = await $.spawnSafe('xcodebuild -license status');
    if (status === SpawnStatus.SUCCESS) return;
    await $.spawn('xcodebuild -license accept', { requiresRoot: true });
  }

  private async listAllDevices(): Promise<Record<string, SimDevice[]> | null> {
    const $ = getPty();
    const { status, data } = await $.spawnSafe('xcrun simctl list devices --json');
    if (status !== SpawnStatus.SUCCESS) return null;
    try {
      const parsed: SimctlDevicesOutput = JSON.parse(data);
      return parsed.devices;
    } catch {
      return null;
    }
  }
}
