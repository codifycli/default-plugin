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

const schema = z.object({
  name: z
    .string()
    .describe('Name for the iOS simulator instance (e.g. "iPhone 15 Dev")'),
  deviceType: z
    .string()
    .describe('Device type identifier (e.g. "com.apple.CoreSimulator.SimDeviceType.iPhone-15")'),
  runtime: z
    .string()
    .describe('Runtime identifier (e.g. "com.apple.CoreSimulator.SimRuntime.iOS-18-0")'),
  state: z
    .enum(['Booted', 'Shutdown'])
    .optional()
    .describe('Desired runtime state of the simulator. Defaults to Shutdown.'),
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
  name: '<Replace me here!>',
  deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
  runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
  state: 'Shutdown',
  os: ['macOS'],
};

const exampleBasic: ExampleConfig = {
  title: 'iPhone 15 simulator for development',
  description: 'Create an iPhone 15 simulator running iOS 18 for use in development and UI testing.',
  configs: [{
    type: 'ios-simulator',
    name: 'iPhone 15 Dev',
    deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
    runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
    state: 'Shutdown',
    os: ['macOS'],
  }],
};

const exampleMultiDevice: ExampleConfig = {
  title: 'iPhone and iPad simulator setup',
  description: 'Install Xcode Command Line Tools and create an iPhone and iPad simulator for cross-device testing.',
  configs: [
    { type: 'xcode-tools', os: ['macOS'] },
    {
      type: 'ios-simulator',
      name: 'iPhone 15 Pro',
      deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
      runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
      state: 'Shutdown',
      os: ['macOS'],
    },
    {
      type: 'ios-simulator',
      name: 'iPad Pro 11-inch',
      deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4',
      runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
      state: 'Shutdown',
      os: ['macOS'],
    },
  ],
};

export class IosSimulatorResource extends Resource<IosSimulatorConfig> {
  getSettings(): ResourceSettings<IosSimulatorConfig> {
    return {
      id: 'ios-simulator',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: exampleMultiDevice,
      },
      operatingSystems: [OS.Darwin],
      dependencies: ['xcode-tools'],
      schema,
      parameterSettings: {
        state: { type: 'string', canModify: true },
      },
      allowMultiple: {
        identifyingParameters: ['name'],
      },
    };
  }

  async refresh(parameters: Partial<IosSimulatorConfig>): Promise<Partial<IosSimulatorConfig> | null> {
    const $ = getPty();

    const { status, data } = await $.spawnSafe('xcrun simctl list devices --json');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    let parsed: SimctlDevicesOutput;
    try {
      parsed = JSON.parse(data);
    } catch {
      return null;
    }

    for (const [runtimeId, devices] of Object.entries(parsed.devices)) {
      const match = devices.find((d) => d.name === parameters.name);
      if (match) {
        return {
          name: match.name,
          deviceType: match.deviceTypeIdentifier,
          runtime: runtimeId,
          state: match.state === 'Booted' ? 'Booted' : 'Shutdown',
        };
      }
    }

    return null;
  }

  async create(plan: CreatePlan<IosSimulatorConfig>): Promise<void> {
    const $ = getPty();
    const { name, deviceType, runtime, state } = plan.desiredConfig;

    // xcrun simctl create prints the new simulator's UDID to stdout
    const { data: udid } = await $.spawn(
      `xcrun simctl create "${name}" "${deviceType}" "${runtime}"`,
      { interactive: true }
    );

    if (state === 'Booted') {
      await $.spawn(`xcrun simctl boot "${udid.trim()}"`, { interactive: true });
    }
  }

  async modify(pc: ParameterChange<IosSimulatorConfig>, plan: ModifyPlan<IosSimulatorConfig>): Promise<void> {
    if (pc.name !== 'state') return;

    const $ = getPty();
    const udid = await this.getUdidByName(plan.desiredConfig.name);
    if (!udid) return;

    if (plan.desiredConfig.state === 'Booted') {
      await $.spawn(`xcrun simctl boot "${udid}"`, { interactive: true });
    } else {
      await $.spawn(`xcrun simctl shutdown "${udid}"`, { interactive: true });
    }
  }

  async destroy(plan: DestroyPlan<IosSimulatorConfig>): Promise<void> {
    const $ = getPty();
    const udid = await this.getUdidByName(plan.currentConfig.name);
    if (!udid) return;

    await $.spawn(`xcrun simctl delete "${udid}"`, { interactive: true });
  }

  private async getUdidByName(name: string | undefined): Promise<string | null> {
    if (!name) return null;

    const $ = getPty();
    const { status, data } = await $.spawnSafe('xcrun simctl list devices --json');
    if (status !== SpawnStatus.SUCCESS) return null;

    try {
      const parsed: SimctlDevicesOutput = JSON.parse(data);
      for (const devices of Object.values(parsed.devices)) {
        const match = devices.find((d) => d.name === name);
        if (match) return match.udid;
      }
    } catch {
      // ignore parse errors
    }

    return null;
  }
}
