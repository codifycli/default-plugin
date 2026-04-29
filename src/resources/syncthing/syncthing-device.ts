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

import { isDaemonRunning } from './syncthing-utils.js';
import { exampleSyncthingConfigs } from './examples.js';

const schema = z
  .object({
    deviceId: z
      .string()
      .describe('The Syncthing device ID (e.g. XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX-XXXXXXX)'),
    deviceName: z
      .string()
      .optional()
      .describe('Human-readable label for this device'),
    addresses: z
      .array(z.string())
      .optional()
      .describe('Connection addresses; use ["dynamic"] for automatic discovery (default: ["dynamic"])'),
    autoAcceptFolders: z
      .boolean()
      .optional()
      .describe('Automatically accept folder shares offered by this device (default: false)'),
    paused: z
      .boolean()
      .optional()
      .describe('Pause syncing with this device without removing it (default: false)'),
    compression: z
      .enum(['always', 'metadata', 'never'])
      .optional()
      .describe('Data compression mode for transfers to this device (default: metadata)'),
    maxSendKbps: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Per-device outgoing rate limit in KiB/s; 0 = unlimited'),
    maxRecvKbps: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Per-device incoming rate limit in KiB/s; 0 = unlimited'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/syncthing/syncthing-device' })
  .describe('A remote Syncthing peer device');

export type SyncthingDeviceConfig = z.infer<typeof schema>;

const defaultConfig: Partial<SyncthingDeviceConfig> = {
  addresses: ['dynamic'],
  autoAcceptFolders: false,
  paused: false,
  compression: 'metadata',
}

const exampleConfig: ExampleConfig = {
  title: 'Example Syncthing device',
  description: 'Add a remote peer device by its device ID. Use dynamic addressing for automatic discovery, metadata compression, and auto-accept any folders the peer shares.',
  configs: [{
    type: 'syncthing-device',
    deviceId: '<Replace me here!>',
    deviceName: 'My Laptop',
    addresses: ['dynamic'],
    autoAcceptFolders: true,
    paused: false,
    compression: 'metadata',
  }]
}

/** Raw JSON shape returned by `syncthing cli config devices <id>` */
interface RawDevice {
  deviceID: string;
  name: string;
  addresses: string[];
  compression: string;
  autoAcceptFolders: boolean;
  paused: boolean;
  maxSendKbps: number;
  maxRecvKbps: number;
}

export class SyncthingDeviceResource extends Resource<SyncthingDeviceConfig> {
  getSettings(): ResourceSettings<SyncthingDeviceConfig> {
    return {
      id: 'syncthing-device',
      defaultConfig,
      exampleConfigs: {
        example1: exampleConfig,
        ...exampleSyncthingConfigs
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: ['syncthing'],
      schema,
      allowMultiple: {
        identifyingParameters: ['deviceId'],
      },
      parameterSettings: {
        deviceName: { type: 'string', canModify: true },
        addresses: { type: 'array', canModify: true },
        autoAcceptFolders: { type: 'boolean', canModify: true },
        paused: { type: 'boolean', canModify: true },
        compression: { type: 'string', canModify: true },
        maxSendKbps: { type: 'number', canModify: true },
        maxRecvKbps: { type: 'number', canModify: true },
      },
    };
  }

  async refresh(
    params: Partial<SyncthingDeviceConfig>
  ): Promise<Partial<SyncthingDeviceConfig> | null> {
    if (!(await isDaemonRunning())) {
      return null;
    }

    const raw = await this.fetchDevice(params.deviceId!);
    if (!raw) {
      return null;
    }

    return deviceFromRaw(raw);
  }

  async create(plan: CreatePlan<SyncthingDeviceConfig>): Promise<void> {
    const $ = getPty();
    const { deviceId, deviceName, addresses, autoAcceptFolders, paused, compression, maxSendKbps, maxRecvKbps } =
      plan.desiredConfig;

    const args = buildDeviceAddArgs({ deviceId, deviceName, addresses, autoAcceptFolders, paused, compression, maxSendKbps, maxRecvKbps });
    await $.spawn(`syncthing cli config devices add ${args}`, { interactive: true });
  }

  async modify(
    pc: ParameterChange<SyncthingDeviceConfig>,
    plan: ModifyPlan<SyncthingDeviceConfig>
  ): Promise<void> {
    const $ = getPty();
    const { deviceId } = plan.desiredConfig;
    const value = plan.desiredConfig[pc.name as keyof SyncthingDeviceConfig];

    const cliPath = deviceOptionCliPath(pc.name as keyof SyncthingDeviceConfig);
    if (cliPath && value !== undefined) {
      await $.spawn(`syncthing cli config devices ${deviceId} ${cliPath} set ${value}`, {
        interactive: true,
      });
    }
  }

  async destroy(plan: DestroyPlan<SyncthingDeviceConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`syncthing cli config devices ${plan.currentConfig.deviceId} delete`, {
      interactive: true,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async fetchDevice(deviceId: string): Promise<RawDevice | null> {
    const $ = getPty();

    // First verify the device ID is in the configured list
    const { status: listStatus, data: listData } = await $.spawnSafe(
      'syncthing cli config devices list'
    );
    if (listStatus !== SpawnStatus.SUCCESS) {
      return null;
    }

    const ids = listData.split('\n').map((s) => s.trim()).filter(Boolean);

    if (!ids.includes(deviceId)) {
      return null;
    }

    // Fetch the full device configuration
    const { status, data } = await $.spawnSafe(`syncthing cli config devices ${deviceId} dump-json`);
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    try {
      return JSON.parse(data) as RawDevice;
    } catch {
      return null;
    }
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function deviceFromRaw(raw: RawDevice): Partial<SyncthingDeviceConfig> {
  return {
    deviceId: raw.deviceID,
    deviceName: raw.name || undefined,
    addresses: raw.addresses,
    compression: raw.compression as SyncthingDeviceConfig['compression'],
    autoAcceptFolders: raw.autoAcceptFolders,
    paused: raw.paused,
    maxSendKbps: raw.maxSendKbps,
    maxRecvKbps: raw.maxRecvKbps,
  };
}

function deviceOptionCliPath(key: keyof SyncthingDeviceConfig): string | undefined {
  const map: Partial<Record<keyof SyncthingDeviceConfig, string>> = {
    deviceName: 'name',
    autoAcceptFolders: 'autoAcceptFolders',
    paused: 'paused',
    compression: 'compression',
    maxSendKbps: 'maxSendKbps',
    maxRecvKbps: 'maxRecvKbps',
  };
  return map[key];
}

function buildDeviceAddArgs(config: Partial<SyncthingDeviceConfig>): string {
  const parts: string[] = [];

  if (config.deviceId) parts.push(`--device-id ${config.deviceId}`);
  if (config.deviceName) parts.push(`--name "${config.deviceName}"`);
  if (config.addresses?.length) parts.push(`--addresses ${config.addresses.join(',')}`);
  if (config.autoAcceptFolders !== undefined)
    parts.push(`--auto-accept-folders=${config.autoAcceptFolders}`);
  if (config.paused !== undefined) parts.push(`--paused=${config.paused}`);
  if (config.compression) parts.push(`--compression ${config.compression}`);
  if (config.maxSendKbps !== undefined) parts.push(`--max-send-kbps ${config.maxSendKbps}`);
  if (config.maxRecvKbps !== undefined) parts.push(`--max-recv-kbps ${config.maxRecvKbps}`);

  return parts.join(' ');
}
