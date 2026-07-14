import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  RefreshContext,
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
  isAvailable: boolean;
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

// com.apple.CoreSimulator.SimRuntime.iOS-26-0 → "com.apple.CoreSimulator.SimRuntime.iOS-26"
function runtimeMajorPrefix(runtimeId: string): string {
  // Strip the patch version component (last -N segment) to get a major-match prefix.
  // iOS-26-0 and iOS-26-3 both share prefix "...iOS-26".
  return runtimeId.replace(/-\d+$/, '');
}

// Two runtime IDs match if they are equal or share the same major-version prefix.
// Allows iOS-26-0 (declared) to match iOS-26-3 (installed).
function runtimesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return runtimeMajorPrefix(a) === runtimeMajorPrefix(b);
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
            runtimesMatch(a.runtime, b.runtime),
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

  async refresh(
    parameters: Partial<IosSimulatorConfig>,
    context: RefreshContext<IosSimulatorConfig>,
  ): Promise<Partial<IosSimulatorConfig> | null> {
    const allDevices = await this.listAllDevices();
    if (!allDevices) return null;

    const simulators: SimulatorDeclaration[] = [];
    for (const [runtimeId, devices] of Object.entries(allDevices)) {
      for (const device of devices) {
        if (!device.isAvailable) continue;
        simulators.push({
          name: device.name,
          deviceType: device.deviceTypeIdentifier,
          runtime: runtimeId,
        });
      }
    }

    // The system always has other simulators unrelated to this config (e.g. Xcode's own
    // default devices). After a destroy, the post-apply validation plan must not mistake
    // those for evidence that this resource still exists, or it will report a spurious
    // "additional changes needed" error forever. Only match against what was actually declared.
    if (context.commandType === 'validationPlan'
      && simulators.filter((s) =>
        context.originalDesiredConfig?.simulators?.some((d) => d.name === s.name)).length === 0
    ) {
      return null;
    }

    return simulators.length > 0 ? { simulators } : null;
  }

  async create(plan: CreatePlan<IosSimulatorConfig>): Promise<void> {
    await this.assertSimctlAvailable();
    if (plan.desiredConfig.acceptLicense !== false) {
      await this.acceptLicenseIfNeeded();
    }
    const simulators = plan.desiredConfig.simulators ?? [];
    if (plan.desiredConfig.downloadRuntimes !== false) {
      await this.downloadMissingRuntimes(simulators);
    } else {
      await this.assertRuntimesAvailable(simulators);
    }
    const available = await this.listAvailableRuntimes();
    const existingDevices = await this.listAllDevices() ?? {};
    const existingNames = new Set(
      Object.values(existingDevices).flat().map((d) => d.name),
    );
    const $ = getPty();
    for (const sim of simulators) {
      if (existingNames.has(sim.name)) continue;
      const runtimeId = this.resolveRuntimeId(sim.runtime, available);
      const { status, data } = await $.spawnSafe(
        `xcrun simctl create "${sim.name}" "${sim.deviceType}" "${runtimeId}"`,
        { interactive: true },
      );
      if (status !== SpawnStatus.SUCCESS) {
        if (data.includes('Invalid runtime')) {
          throw new Error(
            `Runtime "${sim.runtime}" is not installed or not available.\n` +
            'If this is the latest runtime for your Xcode version, download it via:\n' +
            `  xcodebuild -downloadPlatform ${runtimeToXcodebuildPlatform(sim.runtime)}\n` +
            'Older runtimes cannot be fetched this way — install them from Xcode → Settings → ' +
            'Platforms, or via `xcodes runtimes install "<version>"`.',
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
    const available = await this.listAvailableRuntimes();
    for (const sim of toAdd) {
      const runtimeId = this.resolveRuntimeId(sim.runtime, available);
      await $.spawn(
        `xcrun simctl create "${sim.name}" "${sim.deviceType}" "${runtimeId}"`,
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

  private async listAvailableRuntimes(): Promise<SimctlRuntime[]> {
    const $ = getPty();
    const { status, data } = await $.spawnSafe('xcrun simctl list runtimes --json');
    if (status !== SpawnStatus.SUCCESS) return [];
    try {
      const parsed: SimctlRuntimesOutput = JSON.parse(data);
      return parsed.runtimes.filter((r) => r.isAvailable);
    } catch {
      return [];
    }
  }

  // Resolve a declared runtime ID to the actual available one.
  // If the exact ID is available, return it unchanged.
  // Otherwise fall back to the highest-versioned available runtime sharing the same major prefix
  // (e.g. iOS-26-0 → iOS-26-3 when only iOS 26.3 is installed).
  private resolveRuntimeId(declared: string, available: SimctlRuntime[]): string {
    if (available.some((r) => r.identifier === declared)) return declared;

    const prefix = runtimeMajorPrefix(declared);
    const candidates = available.filter((r) => r.identifier.startsWith(prefix));
    if (candidates.length === 0) return declared;

    // Pick the lexicographically highest patch version
    candidates.sort((a, b) => b.identifier.localeCompare(a.identifier));
    return candidates[0].identifier;
  }

  private async getMissingRuntimes(simulators: SimulatorDeclaration[]): Promise<string[]> {
    const available = await this.listAvailableRuntimes();
    const availableIds = new Set(available.map((r) => r.identifier));
    const requiredRuntimes = [...new Set(simulators.map((s) => s.runtime))];
    return requiredRuntimes.filter((declared) => {
      if (availableIds.has(declared)) return false;
      // Also consider it present if a same-major-version runtime is available
      const prefix = runtimeMajorPrefix(declared);
      return !available.some((r) => r.identifier.startsWith(prefix));
    });
  }

  private async downloadMissingRuntimes(simulators: SimulatorDeclaration[]): Promise<void> {
    const missing = await this.getMissingRuntimes(simulators);
    if (missing.length === 0) return;

    const $ = getPty();
    const platforms = [...new Set(missing.map(runtimeToXcodebuildPlatform))];
    for (const platform of platforms) {
      await $.spawn(`xcodebuild -downloadPlatform ${platform}`, { stdin: true });
    }

    // `xcodebuild -downloadPlatform` only ever fetches the single latest runtime for a
    // platform (tied to the active Xcode version) — it cannot target an older/specific
    // version. If the declared runtime is still missing after the download, it's an
    // older version that isn't downloadable this way, so fail with actionable guidance
    // instead of letting the caller hit a generic "Invalid runtime" error later.
    await this.assertRuntimesAvailable(simulators);
  }

  private async assertRuntimesAvailable(simulators: SimulatorDeclaration[]): Promise<void> {
    const missing = await this.getMissingRuntimes(simulators);
    if (missing.length === 0) return;

    const lines: string[] = [
      `The following simulator runtime${missing.length > 1 ? 's are' : ' is'} not installed or not available:`,
      ...missing.map((r) => `  ${r}`),
      '`xcodebuild -downloadPlatform` only fetches the latest runtime for the currently ' +
      'installed Xcode version — it cannot download older/specific versions.',
      'To install an older runtime, either pick it from Xcode → Settings → Platforms, ' +
      'or use a tool like `xcodes runtimes install "<version>"` (https://github.com/XcodesOrg/xcodes).',
    ];
    throw new Error(lines.join('\n'));
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
