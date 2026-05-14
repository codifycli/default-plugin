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

const mouseSchema = z.object({
  naturalScrolling: z.boolean().optional(),
  acceleration: z.boolean().optional(),
  speed: z.number().min(0).max(3).optional(),
}).optional();

const keyboardSchema = z.object({
  keyRepeat: z.number().int().min(1).optional(),
  initialKeyRepeat: z.number().int().min(10).optional(),
  pressAndHold: z.boolean().optional(),
  fnKeysAsStandardKeys: z.boolean().optional(),
  keyboardNavigation: z.boolean().optional(),
}).optional();

const trackpadSchema = z.object({
  speed: z.number().min(0).max(3).optional(),
}).optional();

const dockSchema = z.object({
  position: z.enum(['left', 'bottom', 'right']).optional(),
  iconSize: z.number().int().min(16).max(128).optional(),
  autohide: z.boolean().optional(),
  autohideDelay: z.number().min(0).optional(),
  showRecents: z.boolean().optional(),
  minimizeEffect: z.enum(['genie', 'scale', 'suck']).optional(),
}).optional();

export const schema = z.object({
  mouse: mouseSchema,
  keyboard: keyboardSchema,
  trackpad: trackpadSchema,
  dock: dockSchema,
});

export type MacosSettingsConfig = z.infer<typeof schema>;
type MouseConfig = NonNullable<MacosSettingsConfig['mouse']>;
type KeyboardConfig = NonNullable<MacosSettingsConfig['keyboard']>;
type TrackpadConfig = NonNullable<MacosSettingsConfig['trackpad']>;
type DockConfig = NonNullable<MacosSettingsConfig['dock']>;

const defaultConfig: Partial<MacosSettingsConfig> = {
  mouse: {
    naturalScrolling: true,
    speed: 1.5,
  },
  keyboard: {
    keyRepeat: 6,
    initialKeyRepeat: 68,
    pressAndHold: true,
    fnKeysAsStandardKeys: false,
  },
  dock: {
    position: 'bottom',
    iconSize: 48,
    autohide: false,
    showRecents: true,
    minimizeEffect: 'genie',
  },
};

const exampleCommonPrefs: ExampleConfig = {
  title: 'Common macOS preferences',
  description: 'Configure natural scrolling, fast key repeat, and a minimal Dock for a consistent setup on any new Mac.',
  configs: [{
    type: 'macos-settings',
    os: ['macOS'],
    mouse: {
      naturalScrolling: true,
    },
    keyboard: {
      keyRepeat: 2,
      initialKeyRepeat: 15,
      pressAndHold: false,
    },
    dock: {
      position: 'left',
      iconSize: 36,
      autohide: true,
      showRecents: false,
    },
  }],
};

const exampleNonAppleKeyboard: ExampleConfig = {
  title: 'Non-Apple keyboard setup',
  description: 'Disable natural scrolling and enable standard function keys for a non-Apple keyboard or mouse.',
  configs: [{
    type: 'macos-settings',
    os: ['macOS'],
    mouse: {
      naturalScrolling: false,
      acceleration: false,
    },
    keyboard: {
      fnKeysAsStandardKeys: true,
    },
  }],
};

export class MacosSettingsResource extends Resource<MacosSettingsConfig> {
  getSettings(): ResourceSettings<MacosSettingsConfig> {
    return {
      id: 'macos-settings',
      operatingSystems: [OS.Darwin],
      schema,
      defaultConfig,
      exampleConfigs: {
        example1: exampleCommonPrefs,
        example2: exampleNonAppleKeyboard,
      },
      parameterSettings: {
        mouse: { canModify: true },
        keyboard: { canModify: true },
        trackpad: { canModify: true },
        dock: { canModify: true },
      },
    };
  }

  override async refresh(parameters: Partial<MacosSettingsConfig>): Promise<Partial<MacosSettingsConfig> | null> {
    const result: Partial<MacosSettingsConfig> = {};

    if (parameters.mouse) {
      result.mouse = await this.readMouseSettings(parameters.mouse);
    }
    if (parameters.keyboard) {
      result.keyboard = await this.readKeyboardSettings(parameters.keyboard);
    }
    if (parameters.trackpad) {
      result.trackpad = await this.readTrackpadSettings(parameters.trackpad);
    }
    if (parameters.dock) {
      result.dock = await this.readDockSettings(parameters.dock);
    }

    return result;
  }

  override async create(plan: CreatePlan<MacosSettingsConfig>): Promise<void> {
    const { desiredConfig } = plan;

    if (desiredConfig.mouse) {
      await this.applyMouseSettings(desiredConfig.mouse);
    }
    if (desiredConfig.keyboard) {
      await this.applyKeyboardSettings(desiredConfig.keyboard);
    }
    if (desiredConfig.trackpad) {
      await this.applyTrackpadSettings(desiredConfig.trackpad);
    }
    if (desiredConfig.dock) {
      await this.applyDockSettings(desiredConfig.dock);
    }
  }

  override async modify(pc: ParameterChange<MacosSettingsConfig>, plan: ModifyPlan<MacosSettingsConfig>): Promise<void> {
    const { desiredConfig } = plan;

    if (pc.name === 'mouse' && desiredConfig.mouse) {
      await this.applyMouseSettings(desiredConfig.mouse);
    } else if (pc.name === 'keyboard' && desiredConfig.keyboard) {
      await this.applyKeyboardSettings(desiredConfig.keyboard);
    } else if (pc.name === 'trackpad' && desiredConfig.trackpad) {
      await this.applyTrackpadSettings(desiredConfig.trackpad);
    } else if (pc.name === 'dock' && desiredConfig.dock) {
      await this.applyDockSettings(desiredConfig.dock);
    }
  }

  override async destroy(plan: DestroyPlan<MacosSettingsConfig>): Promise<void> {
    const { currentConfig } = plan;
    const $ = getPty();
    let dockChanged = false;

    if (currentConfig.mouse) {
      await this.deleteMouseSettings(currentConfig.mouse);
    }
    if (currentConfig.keyboard) {
      await this.deleteKeyboardSettings(currentConfig.keyboard);
    }
    if (currentConfig.trackpad) {
      await this.deleteTrackpadSettings(currentConfig.trackpad);
    }
    if (currentConfig.dock) {
      await this.deleteDockSettings(currentConfig.dock);
      dockChanged = true;
    }

    if (dockChanged) {
      await $.spawnSafe('killall Dock');
    }
  }

  // ---- Mouse ----

  private async readMouseSettings(desired: MouseConfig): Promise<MouseConfig> {
    const result: MouseConfig = {};

    if ('naturalScrolling' in desired) {
      result.naturalScrolling = await this.readBool('NSGlobalDomain', 'com.apple.swipescrolldirection') ?? true;
    }
    if ('acceleration' in desired) {
      const linear = await this.readBool('NSGlobalDomain', 'com.apple.mouse.linear') ?? false;
      // com.apple.mouse.linear=true means acceleration is DISABLED; invert for user-friendly name
      result.acceleration = !linear;
    }
    if ('speed' in desired) {
      result.speed = await this.readFloat('NSGlobalDomain', 'com.apple.mouse.scaling') ?? 1.5;
    }

    return result;
  }

  private async applyMouseSettings(settings: MouseConfig): Promise<void> {
    const $ = getPty();

    if (settings.naturalScrolling !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.swipescrolldirection -bool ${settings.naturalScrolling}`);
    }
    if (settings.acceleration !== undefined) {
      // linear=true means no acceleration; invert the user-facing boolean
      await $.spawn(`defaults write NSGlobalDomain com.apple.mouse.linear -bool ${!settings.acceleration}`);
    }
    if (settings.speed !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.mouse.scaling -float ${settings.speed}`);
    }
  }

  private async deleteMouseSettings(settings: MouseConfig): Promise<void> {
    const $ = getPty();

    if ('naturalScrolling' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.swipescrolldirection');
    }
    if ('acceleration' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.mouse.linear');
    }
    if ('speed' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.mouse.scaling');
    }
  }

  // ---- Keyboard ----

  private async readKeyboardSettings(desired: KeyboardConfig): Promise<KeyboardConfig> {
    const result: KeyboardConfig = {};

    if ('keyRepeat' in desired) {
      result.keyRepeat = await this.readInt('NSGlobalDomain', 'KeyRepeat') ?? 6;
    }
    if ('initialKeyRepeat' in desired) {
      result.initialKeyRepeat = await this.readInt('NSGlobalDomain', 'InitialKeyRepeat') ?? 68;
    }
    if ('pressAndHold' in desired) {
      result.pressAndHold = await this.readBool('NSGlobalDomain', 'ApplePressAndHoldEnabled') ?? true;
    }
    if ('fnKeysAsStandardKeys' in desired) {
      result.fnKeysAsStandardKeys = await this.readBool('NSGlobalDomain', 'com.apple.keyboard.fnState') ?? false;
    }
    if ('keyboardNavigation' in desired) {
      const val = await this.readInt('NSGlobalDomain', 'AppleKeyboardUIMode') ?? 0;
      // AppleKeyboardUIMode: 0=disabled, 2=enabled
      result.keyboardNavigation = val === 2;
    }

    return result;
  }

  private async applyKeyboardSettings(settings: KeyboardConfig): Promise<void> {
    const $ = getPty();

    if (settings.keyRepeat !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain KeyRepeat -int ${settings.keyRepeat}`);
    }
    if (settings.initialKeyRepeat !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain InitialKeyRepeat -int ${settings.initialKeyRepeat}`);
    }
    if (settings.pressAndHold !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain ApplePressAndHoldEnabled -bool ${settings.pressAndHold}`);
    }
    if (settings.fnKeysAsStandardKeys !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.keyboard.fnState -bool ${settings.fnKeysAsStandardKeys}`);
    }
    if (settings.keyboardNavigation !== undefined) {
      // Map boolean to the int value macOS expects (0=disabled, 2=enabled)
      await $.spawn(`defaults write NSGlobalDomain AppleKeyboardUIMode -int ${settings.keyboardNavigation ? 2 : 0}`);
    }
  }

  private async deleteKeyboardSettings(settings: KeyboardConfig): Promise<void> {
    const $ = getPty();

    if ('keyRepeat' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain KeyRepeat');
    }
    if ('initialKeyRepeat' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain InitialKeyRepeat');
    }
    if ('pressAndHold' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain ApplePressAndHoldEnabled');
    }
    if ('fnKeysAsStandardKeys' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.keyboard.fnState');
    }
    if ('keyboardNavigation' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain AppleKeyboardUIMode');
    }
  }

  // ---- Trackpad ----

  private async readTrackpadSettings(desired: TrackpadConfig): Promise<TrackpadConfig> {
    const result: TrackpadConfig = {};

    if ('speed' in desired) {
      result.speed = await this.readFloat('NSGlobalDomain', 'com.apple.trackpad.scaling') ?? 1.5;
    }

    return result;
  }

  private async applyTrackpadSettings(settings: TrackpadConfig): Promise<void> {
    const $ = getPty();

    if (settings.speed !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.trackpad.scaling -float ${settings.speed}`);
    }
  }

  private async deleteTrackpadSettings(settings: TrackpadConfig): Promise<void> {
    const $ = getPty();

    if ('speed' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.trackpad.scaling');
    }
  }

  // ---- Dock ----

  private async readDockSettings(desired: DockConfig): Promise<DockConfig> {
    const result: DockConfig = {};

    if ('position' in desired) {
      result.position = (await this.readString('com.apple.dock', 'orientation') ?? 'bottom') as DockConfig['position'];
    }
    if ('iconSize' in desired) {
      result.iconSize = await this.readInt('com.apple.dock', 'tilesize') ?? 48;
    }
    if ('autohide' in desired) {
      result.autohide = await this.readBool('com.apple.dock', 'autohide') ?? false;
    }
    if ('autohideDelay' in desired) {
      result.autohideDelay = await this.readFloat('com.apple.dock', 'autohide-delay') ?? 0.2;
    }
    if ('showRecents' in desired) {
      result.showRecents = await this.readBool('com.apple.dock', 'show-recents') ?? true;
    }
    if ('minimizeEffect' in desired) {
      result.minimizeEffect = (await this.readString('com.apple.dock', 'mineffect') ?? 'genie') as DockConfig['minimizeEffect'];
    }

    return result;
  }

  private async applyDockSettings(settings: DockConfig): Promise<void> {
    const $ = getPty();

    if (settings.position !== undefined) {
      await $.spawn(`defaults write com.apple.dock orientation -string "${settings.position}"`);
    }
    if (settings.iconSize !== undefined) {
      await $.spawn(`defaults write com.apple.dock tilesize -int ${settings.iconSize}`);
    }
    if (settings.autohide !== undefined) {
      await $.spawn(`defaults write com.apple.dock autohide -bool ${settings.autohide}`);
    }
    if (settings.autohideDelay !== undefined) {
      await $.spawn(`defaults write com.apple.dock "autohide-delay" -float ${settings.autohideDelay}`);
    }
    if (settings.showRecents !== undefined) {
      await $.spawn(`defaults write com.apple.dock "show-recents" -bool ${settings.showRecents}`);
    }
    if (settings.minimizeEffect !== undefined) {
      await $.spawn(`defaults write com.apple.dock mineffect -string "${settings.minimizeEffect}"`);
    }

    await $.spawnSafe('killall Dock');
  }

  private async deleteDockSettings(settings: DockConfig): Promise<void> {
    const $ = getPty();
    const keyMap: Record<string, string> = {
      position: 'orientation',
      iconSize: 'tilesize',
      autohide: 'autohide',
      autohideDelay: 'autohide-delay',
      showRecents: 'show-recents',
      minimizeEffect: 'mineffect',
    };

    for (const [prop, key] of Object.entries(keyMap)) {
      if (prop in settings) {
        await $.spawnSafe(`defaults delete com.apple.dock "${key}"`);
      }
    }
  }

  // ---- Low-level defaults read helpers ----

  private async readBool(domain: string, key: string): Promise<boolean | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
    if (status === SpawnStatus.ERROR) return null;
    const val = data.trim();
    return val === '1' || val === 'true' || val === 'YES';
  }

  private async readInt(domain: string, key: string): Promise<number | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
    if (status === SpawnStatus.ERROR) return null;
    const val = parseInt(data.trim(), 10);
    return isNaN(val) ? null : val;
  }

  private async readFloat(domain: string, key: string): Promise<number | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
    if (status === SpawnStatus.ERROR) return null;
    const val = parseFloat(data.trim());
    return isNaN(val) ? null : val;
  }

  private async readString(domain: string, key: string): Promise<string | null> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
    if (status === SpawnStatus.ERROR) return null;
    return data.trim() || null;
  }
}
