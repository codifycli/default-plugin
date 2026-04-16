import {
  CreatePlan,
  DestroyPlan,
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

const FOLDER_TYPES = ['sendreceive', 'sendonly', 'receiveonly', 'receiveencrypted'] as const;

const schema = z
  .object({
    id: z
      .string()
      .describe('Unique folder ID used internally by Syncthing (e.g. "my-docs")'),
    path: z
      .string()
      .describe('Absolute path to the local directory to synchronise'),
    label: z
      .string()
      .optional()
      .describe('Human-readable display name for this folder'),
    type: z
      .enum(FOLDER_TYPES)
      .optional()
      .describe('Folder sync type: sendreceive (default), sendonly, receiveonly, or receiveencrypted'),
    devices: z
      .array(z.string())
      .optional()
      .describe('Device IDs to share this folder with'),
    fsWatcherEnabled: z
      .boolean()
      .optional()
      .describe('Use filesystem event watching for change detection (default: true)'),
    rescanIntervalS: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Full rescan interval in seconds (default: 3600)'),
    maxConflicts: z
      .number()
      .int()
      .min(-1)
      .optional()
      .describe('Maximum number of conflict copies to keep; -1 = unlimited, 0 = disabled'),
    paused: z
      .boolean()
      .optional()
      .describe('Pause syncing this folder without removing it (default: false)'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/syncthing/syncthing-folder' })
  .describe('A Syncthing shared folder');

export type SyncthingFolderConfig = z.infer<typeof schema>;

/** Raw JSON shape returned by `syncthing cli config folders <id>` */
interface RawFolder {
  id: string;
  label: string;
  path: string;
  type: string;
  devices: Array<{ deviceID: string }>;
  fsWatcherEnabled: boolean;
  rescanIntervalS: number;
  maxConflicts: number;
  paused: boolean;
}

export class SyncthingFolderResource extends Resource<SyncthingFolderConfig> {
  getSettings(): ResourceSettings<SyncthingFolderConfig> {
    return {
      id: 'syncthing-folder',
      operatingSystems: [OS.Darwin, OS.Linux],
      dependencies: ['syncthing'],
      schema,
      allowMultiple: {
        identifyingParameters: ['id'],
      },
      parameterSettings: {
        path: { type: 'directory', canModify: false },
        label: { type: 'string', canModify: true },
        type: { type: 'string', canModify: true },
        devices: { type: 'array', canModify: true },
        fsWatcherEnabled: { type: 'boolean', canModify: true },
        rescanIntervalS: { type: 'number', canModify: true },
        maxConflicts: { type: 'number', canModify: true },
        paused: { type: 'boolean', canModify: true },
      },
    };
  }

  async refresh(
    params: Partial<SyncthingFolderConfig>
  ): Promise<Partial<SyncthingFolderConfig> | null> {
    if (!(await isDaemonRunning())) {
      return null;
    }

    const raw = await this.fetchFolder(params.id!);
    if (!raw) {
      return null;
    }

    return folderFromRaw(raw);
  }

  async create(plan: CreatePlan<SyncthingFolderConfig>): Promise<void> {
    const $ = getPty();
    const config = plan.desiredConfig;

    const args = buildFolderAddArgs(config);
    await $.spawn(`syncthing cli config folders add ${args}`, { interactive: true });

    // Share with each specified device
    for (const deviceId of config.devices ?? []) {
      await $.spawn(
        `syncthing cli config folders ${config.id} devices add --device-id ${deviceId}`,
        { interactive: true }
      );
    }
  }

  async modify(
    pc: ParameterChange<SyncthingFolderConfig>,
    plan: ModifyPlan<SyncthingFolderConfig>
  ): Promise<void> {
    const $ = getPty();
    const { id } = plan.desiredConfig;

    if (pc.name === 'devices') {
      await this.reconcileDevices(id, plan.currentConfig.devices ?? [], plan.desiredConfig.devices ?? []);
      return;
    }

    const cliPath = folderOptionCliPath(pc.name as keyof SyncthingFolderConfig);
    const value = plan.desiredConfig[pc.name as keyof SyncthingFolderConfig];

    if (cliPath && value !== undefined) {
      await $.spawn(`syncthing cli config folders ${id} ${cliPath} set ${value}`, {
        interactive: true,
      });
    }
  }

  async destroy(plan: DestroyPlan<SyncthingFolderConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`syncthing cli config folders ${plan.currentConfig.id} delete`, {
      interactive: true,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async fetchFolder(folderId: string): Promise<RawFolder | null> {
    const $ = getPty();

    // Verify the folder ID exists in the configured list
    const { status: listStatus, data: listData } = await $.spawnSafe(
      'syncthing cli config folders list'
    );
    if (listStatus !== SpawnStatus.SUCCESS) {
      return null;
    }

    let ids: string[];
    try {
      ids = JSON.parse(listData) as string[];
    } catch {
      return null;
    }

    if (!ids.includes(folderId)) {
      return null;
    }

    // Fetch the full folder configuration
    const { status, data } = await $.spawnSafe(`syncthing cli config folders ${folderId}`);
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    try {
      return JSON.parse(data) as RawFolder;
    } catch {
      return null;
    }
  }

  private async reconcileDevices(
    folderId: string,
    current: string[],
    desired: string[]
  ): Promise<void> {
    const $ = getPty();

    const toAdd = desired.filter((d) => !current.includes(d));
    const toRemove = current.filter((c) => !desired.includes(c));

    for (const deviceId of toAdd) {
      await $.spawn(
        `syncthing cli config folders ${folderId} devices add --device-id ${deviceId}`,
        { interactive: true }
      );
    }

    for (const deviceId of toRemove) {
      await $.spawn(
        `syncthing cli config folders ${folderId} devices ${deviceId} delete`,
        { interactive: true }
      );
    }
  }
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function folderFromRaw(raw: RawFolder): Partial<SyncthingFolderConfig> {
  return {
    id: raw.id,
    label: raw.label || undefined,
    path: raw.path,
    type: raw.type as SyncthingFolderConfig['type'],
    devices: raw.devices.map((d) => d.deviceID),
    fsWatcherEnabled: raw.fsWatcherEnabled,
    rescanIntervalS: raw.rescanIntervalS,
    maxConflicts: raw.maxConflicts,
    paused: raw.paused,
  };
}

function folderOptionCliPath(key: keyof SyncthingFolderConfig): string | undefined {
  const map: Partial<Record<keyof SyncthingFolderConfig, string>> = {
    label: 'label',
    type: 'type',
    fsWatcherEnabled: 'fsWatcherEnabled',
    rescanIntervalS: 'rescanIntervalS',
    maxConflicts: 'maxConflicts',
    paused: 'paused',
  };
  return map[key];
}

function buildFolderAddArgs(config: Partial<SyncthingFolderConfig>): string {
  const parts: string[] = [];

  if (config.id) parts.push(`--id ${config.id}`);
  if (config.path) parts.push(`--path "${config.path}"`);
  if (config.label) parts.push(`--label "${config.label}"`);
  if (config.type) parts.push(`--type ${config.type}`);
  if (config.fsWatcherEnabled !== undefined)
    parts.push(`--fs-watcher-enabled=${config.fsWatcherEnabled}`);
  if (config.rescanIntervalS !== undefined)
    parts.push(`--rescan-interval-s ${config.rescanIntervalS}`);
  if (config.maxConflicts !== undefined) parts.push(`--max-conflicts ${config.maxConflicts}`);
  if (config.paused !== undefined) parts.push(`--paused=${config.paused}`);

  return parts.join(' ');
}
