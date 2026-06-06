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
  CodifyCliSender,
  ApplyNotes,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

const mouseSchema = z.object({
  naturalScrolling: z.boolean().optional()
    .describe('Scroll content in the natural direction (content follows finger). When false, uses the traditional scroll direction.'),
  acceleration: z.boolean().optional()
    .describe('Enable mouse acceleration. When false, the cursor moves at a fixed speed regardless of how fast the mouse is moved.'),
  speed: z.number().min(0).max(3).optional()
    .describe('Mouse tracking speed (0–3). Higher values make the cursor move farther per physical movement.'),
}).optional()
  .describe('Mouse settings.');

const keyboardSchema = z.object({
  keyRepeat: z.number().int().min(1).optional()
    .describe('Rate of key repeat while a key is held. Lower = faster (1 is fastest; 120 effectively disables repeat).'),
  initialKeyRepeat: z.number().int().min(10).optional()
    .describe('Delay before key repeat begins, in ticks. Lower = shorter delay (10 minimum).'),
  pressAndHold: z.boolean().optional()
    .describe('When true, holding a key shows the accent character picker. When false, the key repeats instead.'),
  fnKeysAsStandardKeys: z.boolean().optional()
    .describe('When true, the F1–F12 keys act as standard function keys; press Fn to trigger special actions (brightness, volume, etc.).'),
  keyboardNavigation: z.boolean().optional()
    .describe('When true, enables Tab-based focus navigation in system dialogs (equivalent to "Keyboard navigation" in System Settings).'),
}).optional()
  .describe('Keyboard settings.');

const trackpadSchema = z.object({
  speed: z.number().min(0).max(3).optional()
    .describe('Trackpad tracking speed (0–3). Higher values make the cursor move farther per swipe distance.'),
}).optional()
  .describe('Trackpad settings.');

const dockSchema = z.object({
  position: z.enum(['left', 'bottom', 'right']).optional()
    .describe('Position of the Dock on screen.'),
  iconSize: z.number().int().min(16).max(128).optional()
    .describe('Dock icon size in pixels (16–128).'),
  autohide: z.boolean().optional()
    .describe('Automatically hide and show the Dock when the cursor moves near the screen edge.'),
  hoverDelay: z.number().min(0).optional()
    .describe('Seconds to wait before the Dock appears when hovering near the screen edge. Set to 0 for instant reveal. Default is 0.2.'),
  animationSpeed: z.number().min(0).optional()
    .describe('Duration in seconds of the Dock slide-in/out animation. Set to 0 to disable the animation entirely. Default is 0.5.'),
  showRecents: z.boolean().optional()
    .describe('Show recently opened apps in a dedicated section of the Dock.'),
  minimizeEffect: z.enum(['genie', 'scale', 'suck']).optional()
    .describe('Window minimize animation style.'),
}).optional()
  .describe('Dock settings.');

export const schema = z.object({
  mouse: mouseSchema,
  keyboard: keyboardSchema,
  trackpad: trackpadSchema,
  dock: dockSchema,
}).describe('Manages common macOS system preferences using the built-in defaults command. Covers mouse, keyboard, trackpad, and Dock settings.');

export type MacosSettingsConfig = z.infer<typeof schema>;
type MouseConfig = NonNullable<MacosSettingsConfig['mouse']>;
type KeyboardConfig = NonNullable<MacosSettingsConfig['keyboard']>;
type TrackpadConfig = NonNullable<MacosSettingsConfig['trackpad']>;
type DockConfig = NonNullable<MacosSettingsConfig['dock']>;

const defaultConfig: Partial<MacosSettingsConfig> = {
  mouse: {},
  keyboard: {},
  dock: {},
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
        mouse: { type: 'object', canModify: true },
        keyboard: { type: 'object', canModify: true },
        trackpad: { type: 'object', canModify: true },
        dock: { type: 'object', canModify: true },
      },
    };
  }

  override async refresh(parameters: Partial<MacosSettingsConfig>): Promise<Partial<MacosSettingsConfig> | null> {
    const result: Partial<MacosSettingsConfig> = {};
    let anyFound = false;

    if (parameters.mouse) {
      const mouse = await this.readMouseSettings(parameters.mouse);
      if (mouse !== null) { result.mouse = mouse; anyFound = true; }
    }
    if (parameters.keyboard) {
      const keyboard = await this.readKeyboardSettings(parameters.keyboard);
      if (keyboard !== null) { result.keyboard = keyboard; anyFound = true; }
    }
    if (parameters.trackpad) {
      const trackpad = await this.readTrackpadSettings(parameters.trackpad);
      if (trackpad !== null) { result.trackpad = trackpad; anyFound = true; }
    }
    if (parameters.dock) {
      const dock = await this.readDockSettings(parameters.dock);
      if (dock !== null) { result.dock = dock; anyFound = true; }
    }

    return anyFound ? result : {};
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

  private async readMouseSettings(desired: MouseConfig): Promise<MouseConfig | null> {
    const result: MouseConfig = {};
    let anyFound = false;

    if ('naturalScrolling' in desired) {
      const v = await this.readBool('NSGlobalDomain', 'com.apple.swipescrolldirection');
      if (v !== null) { result.naturalScrolling = v; anyFound = true; }
    }
    if ('acceleration' in desired) {
      const linear = await this.readBool('NSGlobalDomain', 'com.apple.mouse.linear');
      // com.apple.mouse.linear=true means acceleration is DISABLED; invert for user-friendly name
      if (linear !== null) { result.acceleration = !linear; anyFound = true; }
    }
    if ('speed' in desired) {
      const v = await this.readFloat('NSGlobalDomain', 'com.apple.mouse.scaling');
      if (v !== null) { result.speed = v; anyFound = true; }
    }

    return anyFound ? result : null;
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

    await CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings')
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

    await CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings')
  }

  // ---- Keyboard ----

  private async readKeyboardSettings(desired: KeyboardConfig): Promise<KeyboardConfig | null> {
    const result: KeyboardConfig = {};
    let anyFound = false;

    if ('keyRepeat' in desired) {
      const v = await this.readInt('NSGlobalDomain', 'KeyRepeat');
      if (v !== null) { result.keyRepeat = v; anyFound = true; }
    }
    if ('initialKeyRepeat' in desired) {
      const v = await this.readInt('NSGlobalDomain', 'InitialKeyRepeat');
      if (v !== null) { result.initialKeyRepeat = v; anyFound = true; }
    }
    if ('pressAndHold' in desired) {
      const v = await this.readBool('NSGlobalDomain', 'ApplePressAndHoldEnabled');
      if (v !== null) { result.pressAndHold = v; anyFound = true; }
    }
    if ('fnKeysAsStandardKeys' in desired) {
      const v = await this.readBool('NSGlobalDomain', 'com.apple.keyboard.fnState');
      if (v !== null) { result.fnKeysAsStandardKeys = v; anyFound = true; }
    }
    if ('keyboardNavigation' in desired) {
      const v = await this.readInt('NSGlobalDomain', 'AppleKeyboardUIMode');
      // AppleKeyboardUIMode: 0=disabled, 2=enabled
      if (v !== null) { result.keyboardNavigation = v === 2; anyFound = true; }
    }

    return anyFound ? result : null;
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

    await CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings')
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

    await CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings')
  }

  // ---- Trackpad ----

  private async readTrackpadSettings(desired: TrackpadConfig): Promise<TrackpadConfig | null> {
    const result: TrackpadConfig = {};
    let anyFound = false;

    if ('speed' in desired) {
      const v = await this.readFloat('NSGlobalDomain', 'com.apple.trackpad.scaling');
      if (v !== null) { result.speed = v; anyFound = true; }
    }

    return anyFound ? result : null;
  }

  private async applyTrackpadSettings(settings: TrackpadConfig): Promise<void> {
    const $ = getPty();

    if (settings.speed !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.trackpad.scaling -float ${settings.speed}`);
    }

    await CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings')
  }

  private async deleteTrackpadSettings(settings: TrackpadConfig): Promise<void> {
    const $ = getPty();

    if ('speed' in settings) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.trackpad.scaling');
    }

    await CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings')
  }

  // ---- Dock ----

  private async readDockSettings(desired: DockConfig): Promise<DockConfig | null> {
    const result: DockConfig = {};
    let anyFound = false;

    if ('position' in desired) {
      const v = await this.readString('com.apple.dock', 'orientation');
      if (v !== null) { result.position = v as DockConfig['position']; anyFound = true; }
    }
    if ('iconSize' in desired) {
      const v = await this.readInt('com.apple.dock', 'tilesize');
      if (v !== null) { result.iconSize = v; anyFound = true; }
    }
    if ('autohide' in desired) {
      const v = await this.readBool('com.apple.dock', 'autohide');
      if (v !== null) { result.autohide = v; anyFound = true; }
    }
    if ('hoverDelay' in desired) {
      const v = await this.readFloat('com.apple.dock', 'autohide-delay');
      if (v !== null) { result.hoverDelay = v; anyFound = true; }
    }
    if ('animationSpeed' in desired) {
      const v = await this.readFloat('com.apple.dock', 'autohide-time-modifier');
      if (v !== null) { result.animationSpeed = v; anyFound = true; }
    }
    if ('showRecents' in desired) {
      const v = await this.readBool('com.apple.dock', 'show-recents');
      if (v !== null) { result.showRecents = v; anyFound = true; }
    }
    if ('minimizeEffect' in desired) {
      const v = await this.readString('com.apple.dock', 'mineffect');
      if (v !== null) { result.minimizeEffect = v as DockConfig['minimizeEffect']; anyFound = true; }
    }

    return anyFound ? result : null;
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
    if (settings.hoverDelay !== undefined) {
      await $.spawn(`defaults write com.apple.dock "autohide-delay" -float ${settings.hoverDelay}`);
    }
    if (settings.animationSpeed !== undefined) {
      await $.spawn(`defaults write com.apple.dock "autohide-time-modifier" -float ${settings.animationSpeed}`);
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
      hoverDelay: 'autohide-delay',
      animationSpeed: 'autohide-time-modifier',
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
