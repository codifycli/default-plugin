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
    await this.assertSimctlAvailable();
    const $ = getPty();
    for (const sim of plan.desiredConfig.simulators ?? []) {
      await $.spawn(
        `xcrun simctl create "${sim.name}" "${sim.deviceType}" "${sim.runtime}"`,
        { interactive: true },
      );
    }
  }

  async modify(pc: ParameterChange<IosSimulatorConfig>, _plan: ModifyPlan<IosSimulatorConfig>): Promise<void> {
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

    for (const sim of plan.currentConfig.simulators ?? []) {
      for (const devices of Object.values(allDevices)) {
        const match = devices.find((d) => d.name === sim.name);
        if (match) {
          await $.spawn(`xcrun simctl delete "${match.udid}"`, { interactive: true });
          break;
        }
      }
    }
  }

  private async assertSimctlAvailable(): Promise<void> {
    const $ = getPty();
    const { status } = await $.spawnSafe('xcrun simctl help');
    if (status !== SpawnStatus.SUCCESS) {
      throw new Error(
        'xcrun simctl is not available. Xcode must be installed to manage iOS simulators. ' +
        'Install it manually from the Mac App Store or use the xcodes resource to manage Xcode versions.',
      );
    }
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
