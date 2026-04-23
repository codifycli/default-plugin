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
  Utils
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { exampleSyncthingConfigs } from './examples.js';
import {
  getCliConfigBool,
  getCliConfigNumber,
  getCliConfigValue,
  isDaemonRunning,
  setCliConfigValue,
  waitForDaemon,
} from './syncthing-utils.js';

const schema = z
  .object({
    launchAtStartup: z
      .boolean()
      .optional()
      .describe('Start Syncthing automatically at login (default: true)'),
    guiAddress: z
      .string()
      .optional()
      .describe('Address the GUI/REST API listens on (default: 127.0.0.1:8384)'),
    globalAnnounceEnabled: z
      .boolean()
      .optional()
      .describe('Announce this device to the global discovery server (default: true)'),
    localAnnounceEnabled: z
      .boolean()
      .optional()
      .describe('Announce via local network broadcast (default: true)'),
    relaysEnabled: z
      .boolean()
      .optional()
      .describe('Allow traffic to be routed through relay servers (default: true)'),
    natEnabled: z
      .boolean()
      .optional()
      .describe('Attempt NAT traversal to improve connectivity (default: true)'),
    maxSendKbps: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Maximum outgoing transfer rate in KiB/s; 0 = unlimited'),
    maxRecvKbps: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Maximum incoming transfer rate in KiB/s; 0 = unlimited'),
    startBrowser: z
      .boolean()
      .optional()
      .describe('Open the GUI in a browser on startup (default: true)'),
    urAccepted: z
      .number()
      .int()
      .optional()
      .describe('Usage-reporting consent level; set -1 to opt out'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/syncthing/syncthing' })
  .describe('Syncthing continuous file-synchronisation daemon');

export type SyncthingConfig = z.infer<typeof schema>;

const defaultConfig: Partial<SyncthingConfig> = {
  launchAtStartup: true,
  globalAnnounceEnabled: true,
  localAnnounceEnabled: true,
  relaysEnabled: true,
  natEnabled: true,
  startBrowser: false,
  urAccepted: -1,
}

const exampleConfig: ExampleConfig = {
  title: 'Example Syncthing config',
  description: 'Install Syncthing with sensible defaults: launch at startup, local and global discovery enabled, relays on, no browser auto-open, and usage reporting opted out.',
  configs: [{
    type: 'syncthing',
    launchAtStartup: true,
    globalAnnounceEnabled: true,
    localAnnounceEnabled: true,
    relaysEnabled: true,
    natEnabled: true,
    startBrowser: false,
    urAccepted: -1,
  }]
}

// Maps schema key → syncthing CLI config path (without trailing "get/set <value>")
// Syncthing v2 uses kebab-case subcommands
const OPTION_CLI_PATHS: Partial<Record<keyof SyncthingConfig, string>> = {
  guiAddress: 'gui raw-address',
  globalAnnounceEnabled: 'options global-ann-enabled',
  localAnnounceEnabled: 'options local-ann-enabled',
  relaysEnabled: 'options relays-enabled',
  natEnabled: 'options natenabled',
  maxSendKbps: 'options max-send-kbps',
  maxRecvKbps: 'options max-recv-kbps',
  startBrowser: 'options start-browser',
  urAccepted: 'options uraccepted',
};

export class SyncthingResource extends Resource<SyncthingConfig> {
  getSettings(): ResourceSettings<SyncthingConfig> {
    return {
      id: 'syncthing',
      defaultConfig,
      exampleConfigs: {
        example1: exampleConfig,
        ...exampleSyncthingConfigs,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        launchAtStartup: { type: 'boolean', canModify: true },
        guiAddress: { type: 'string', canModify: true },
        globalAnnounceEnabled: { type: 'boolean', canModify: true },
        localAnnounceEnabled: { type: 'boolean', canModify: true },
        relaysEnabled: { type: 'boolean', canModify: true },
        natEnabled: { type: 'boolean', canModify: true },
        maxSendKbps: { type: 'number', canModify: true },
        maxRecvKbps: { type: 'number', canModify: true },
        startBrowser: { type: 'boolean', canModify: true },
        urAccepted: { type: 'number', canModify: true },
      },
    };
  }

  async refresh(_params: Partial<SyncthingConfig>): Promise<Partial<SyncthingConfig> | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which syncthing');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    const result: Partial<SyncthingConfig> = {};

    result.launchAtStartup = await this.isLaunchAtStartupEnabled();

    // Option values can only be fetched when the daemon is running
    if (await isDaemonRunning()) {
      result.guiAddress = await getCliConfigValue('gui raw-address');
      result.globalAnnounceEnabled = await getCliConfigBool('options global-ann-enabled');
      result.localAnnounceEnabled = await getCliConfigBool('options local-ann-enabled');
      result.relaysEnabled = await getCliConfigBool('options relays-enabled');
      result.natEnabled = await getCliConfigBool('options natenabled');
      result.maxSendKbps = await getCliConfigNumber('options max-send-kbps');
      result.maxRecvKbps = await getCliConfigNumber('options max-recv-kbps');
      result.startBrowser = await getCliConfigBool('options start-browser');
      result.urAccepted = await getCliConfigNumber('options uraccepted');
    }

    return result;
  }

  async create(plan: CreatePlan<SyncthingConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await this.installOnMacOs(plan.desiredConfig);
    } else {
      await this.installOnLinux(plan.desiredConfig);
    }
  }

  async modify(
    pc: ParameterChange<SyncthingConfig>,
    plan: ModifyPlan<SyncthingConfig>
  ): Promise<void> {
    if (pc.name === 'launchAtStartup') {
      await this.setLaunchAtStartup(plan.desiredConfig.launchAtStartup ?? true);
      return;
    }

    const cliPath = OPTION_CLI_PATHS[pc.name as keyof SyncthingConfig];
    const value = plan.desiredConfig[pc.name as keyof SyncthingConfig];

    if (cliPath !== undefined && value !== undefined) {
      await setCliConfigValue(cliPath, String(value));
    }
  }

  async destroy(_plan: DestroyPlan<SyncthingConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await this.uninstallOnMacOs();
    } else {
      await this.uninstallOnLinux();
    }
  }

  // ── macOS ──────────────────────────────────────────────────────────────────

  private async installOnMacOs(config: Partial<SyncthingConfig>): Promise<void> {
    const $ = getPty();

    if (!(await Utils.isHomebrewInstalled())) {
      throw new Error('Homebrew is not installed. Please install Homebrew before installing Syncthing.');
    }

    await $.spawn('brew install syncthing', {
      interactive: true,
      env: { HOMEBREW_NO_AUTO_UPDATE: 1 },
    });

    const shouldLaunchAtStartup = config.launchAtStartup ?? true;
    await this.setLaunchAtStartup(shouldLaunchAtStartup);

    await waitForDaemon();
    await this.applyAllOptions(config);
  }

  private async uninstallOnMacOs(): Promise<void> {
    const $ = getPty();
    await $.spawnSafe('brew services stop syncthing');
    await $.spawnSafe('brew uninstall syncthing', {
      env: { HOMEBREW_NO_AUTO_UPDATE: 1 },
    });
  }

  // ── Linux ──────────────────────────────────────────────────────────────────

  private async installOnLinux(config: Partial<SyncthingConfig>): Promise<void> {
    const $ = getPty();

    // Add the official Syncthing apt repository
    await $.spawn('mkdir -p /etc/apt/keyrings', { interactive: true, requiresRoot: true });
    await $.spawn(
      'curl -L -o /etc/apt/keyrings/syncthing-archive-keyring.gpg https://syncthing.net/release-key.gpg',
      { interactive: true, requiresRoot: true }
    );
    await $.spawn(
      'bash -c \'echo "deb [signed-by=/etc/apt/keyrings/syncthing-archive-keyring.gpg] https://apt.syncthing.net/ syncthing stable" > /etc/apt/sources.list.d/syncthing.list\'',
      { interactive: true, requiresRoot: true }
    );
    await $.spawn('apt-get update', { interactive: true, requiresRoot: true });
    await $.spawn('apt-get install -y syncthing', { interactive: true, requiresRoot: true });

    const shouldLaunchAtStartup = config.launchAtStartup ?? true;
    await this.setLaunchAtStartup(shouldLaunchAtStartup);

    await waitForDaemon();
    await this.applyAllOptions(config);
  }

  private async uninstallOnLinux(): Promise<void> {
    const $ = getPty();
    await $.spawnSafe('systemctl --user stop syncthing');
    await $.spawnSafe('systemctl --user disable syncthing');
    await $.spawnSafe('apt-get remove -y syncthing', { requiresRoot: true });
    await $.spawnSafe('rm -f /etc/apt/sources.list.d/syncthing.list', { requiresRoot: true });
    await $.spawnSafe('rm -f /etc/apt/keyrings/syncthing-archive-keyring.gpg', { requiresRoot: true });
  }

  // ── Service management ────────────────────────────────────────────────────

  private async isLaunchAtStartupEnabled(): Promise<boolean> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      const { status, data } = await $.spawnSafe('brew services list');
      if (status !== SpawnStatus.SUCCESS) return false;
      const syncthingLine = data.split('\n').find((l) => l.startsWith('syncthing'));
      if (!syncthingLine) return false;
      return syncthingLine.includes('started') || syncthingLine.includes('running');
    }

    if (Utils.isLinux()) {
      const { status } = await $.spawnSafe('systemctl --user is-enabled syncthing');
      return status === SpawnStatus.SUCCESS;
    }

    return false;
  }

  private async setLaunchAtStartup(enabled: boolean): Promise<void> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      if (enabled) {
        await $.spawn('brew services start syncthing', { interactive: true });
      } else {
        await $.spawnSafe('brew services stop syncthing');
        await $.spawn('syncthing serve --no-browser --home ~/.config/syncthing &', {
          interactive: true,
        });
      }
      return;
    }

    if (Utils.isLinux()) {
      if (enabled) {
        await $.spawn('systemctl --user enable --now syncthing', { interactive: true });
      } else {
        await $.spawnSafe('systemctl --user disable syncthing');
        await $.spawn('syncthing serve --no-browser &', { interactive: true });
      }
    }
  }

  // ── Config options ─────────────────────────────────────────────────────────

  private async applyAllOptions(config: Partial<SyncthingConfig>): Promise<void> {
    for (const [key, cliPath] of Object.entries(OPTION_CLI_PATHS) as Array<[keyof SyncthingConfig, string]>) {
      const value = config[key];
      if (value !== undefined) {
        await setCliConfigValue(cliPath, String(value));
      }
    }
  }
}
