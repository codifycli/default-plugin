import isEqual from 'lodash.isequal';

import {
  ApplyNotes,
  CodifyCliSender,
  ExampleConfig,
  Plan,
  Resource,
  ResourceSettings,
  SpawnStatus,
  StatefulParameter,
  getPty,
  z,
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

// ---- Low-level defaults read helpers ----

async function readBool(domain: string, key: string): Promise<boolean | null> {
  const $ = getPty();
  const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
  if (status === SpawnStatus.ERROR) return null;
  const val = data.trim();
  return val === '1' || val === 'true' || val === 'YES';
}

async function readInt(domain: string, key: string): Promise<number | null> {
  const $ = getPty();
  const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
  if (status === SpawnStatus.ERROR) return null;
  const val = parseInt(data.trim(), 10);
  return isNaN(val) ? null : val;
}

async function readFloat(domain: string, key: string): Promise<number | null> {
  const $ = getPty();
  const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
  if (status === SpawnStatus.ERROR) return null;
  const val = parseFloat(data.trim());
  return isNaN(val) ? null : val;
}

async function readString(domain: string, key: string): Promise<string | null> {
  const $ = getPty();
  const { data, status } = await $.spawnSafe(`defaults read "${domain}" "${key}"`);
  if (status === SpawnStatus.ERROR) return null;
  return data.trim() || null;
}

// ---- Mouse ----

class MouseSettingsParameter extends StatefulParameter<MacosSettingsConfig, MouseConfig> {
  override getSettings() { return { isEqual }; }

  async refresh(desired: MouseConfig | null, _config: Partial<MacosSettingsConfig>): Promise<MouseConfig | null> {
    if (!desired) return null;
    const result: MouseConfig = {};
    let anyFound = false;

    if ('naturalScrolling' in desired) {
      const v = await readBool('NSGlobalDomain', 'com.apple.swipescrolldirection');
      if (v !== null) { result.naturalScrolling = v; anyFound = true; }
    }
    if ('acceleration' in desired) {
      const linear = await readBool('NSGlobalDomain', 'com.apple.mouse.linear');
      if (linear !== null) { result.acceleration = !linear; anyFound = true; }
    }
    if ('speed' in desired) {
      const v = await readFloat('NSGlobalDomain', 'com.apple.mouse.scaling');
      if (v !== null) { result.speed = v; anyFound = true; }
    }

    return anyFound ? result : null;
  }

  async add(value: MouseConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyMouseSettings(value);
  }

  async modify(newValue: MouseConfig, _previousValue: MouseConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyMouseSettings(newValue);
  }

  async remove(value: MouseConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    const $ = getPty();
    if ('naturalScrolling' in value) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.swipescrolldirection');
    }
    if ('acceleration' in value) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.mouse.linear');
    }
    if ('speed' in value) {
      await $.spawnSafe('defaults delete NSGlobalDomain com.apple.mouse.scaling');
    }
    CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings');
  }

  private async applyMouseSettings(settings: MouseConfig): Promise<void> {
    const $ = getPty();
    if (settings.naturalScrolling !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.swipescrolldirection -bool ${settings.naturalScrolling}`);
    }
    if (settings.acceleration !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.mouse.linear -bool ${!settings.acceleration}`);
    }
    if (settings.speed !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.mouse.scaling -float ${settings.speed}`);
    }
    CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings');
  }
}

// ---- Keyboard ----

class KeyboardSettingsParameter extends StatefulParameter<MacosSettingsConfig, KeyboardConfig> {
  override getSettings() { return { isEqual }; }

  async refresh(desired: KeyboardConfig | null, _config: Partial<MacosSettingsConfig>): Promise<KeyboardConfig | null> {
    if (!desired) return null;
    const result: KeyboardConfig = {};
    let anyFound = false;

    if ('keyRepeat' in desired) {
      const v = await readInt('NSGlobalDomain', 'KeyRepeat');
      if (v !== null) { result.keyRepeat = v; anyFound = true; }
    }
    if ('initialKeyRepeat' in desired) {
      const v = await readInt('NSGlobalDomain', 'InitialKeyRepeat');
      if (v !== null) { result.initialKeyRepeat = v; anyFound = true; }
    }
    if ('pressAndHold' in desired) {
      const v = await readBool('NSGlobalDomain', 'ApplePressAndHoldEnabled');
      if (v !== null) { result.pressAndHold = v; anyFound = true; }
    }
    if ('fnKeysAsStandardKeys' in desired) {
      const v = await readBool('NSGlobalDomain', 'com.apple.keyboard.fnState');
      if (v !== null) { result.fnKeysAsStandardKeys = v; anyFound = true; }
    }
    if ('keyboardNavigation' in desired) {
      const v = await readInt('NSGlobalDomain', 'AppleKeyboardUIMode');
      if (v !== null) { result.keyboardNavigation = v === 2; anyFound = true; }
    }

    return anyFound ? result : null;
  }

  async add(value: KeyboardConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyKeyboardSettings(value);
  }

  async modify(newValue: KeyboardConfig, _previousValue: KeyboardConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyKeyboardSettings(newValue);
  }

  async remove(value: KeyboardConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    const $ = getPty();
    if ('keyRepeat' in value) await $.spawnSafe('defaults delete NSGlobalDomain KeyRepeat');
    if ('initialKeyRepeat' in value) await $.spawnSafe('defaults delete NSGlobalDomain InitialKeyRepeat');
    if ('pressAndHold' in value) await $.spawnSafe('defaults delete NSGlobalDomain ApplePressAndHoldEnabled');
    if ('fnKeysAsStandardKeys' in value) await $.spawnSafe('defaults delete NSGlobalDomain com.apple.keyboard.fnState');
    if ('keyboardNavigation' in value) await $.spawnSafe('defaults delete NSGlobalDomain AppleKeyboardUIMode');
    CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings');
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
      await $.spawn(`defaults write NSGlobalDomain AppleKeyboardUIMode -int ${settings.keyboardNavigation ? 2 : 0}`);
    }
    CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings');
  }
}

// ---- Trackpad ----

class TrackpadSettingsParameter extends StatefulParameter<MacosSettingsConfig, TrackpadConfig> {
  override getSettings() { return { isEqual }; }

  async refresh(desired: TrackpadConfig | null, _config: Partial<MacosSettingsConfig>): Promise<TrackpadConfig | null> {
    if (!desired) return null;
    const result: TrackpadConfig = {};
    let anyFound = false;

    if ('speed' in desired) {
      const v = await readFloat('NSGlobalDomain', 'com.apple.trackpad.scaling');
      if (v !== null) { result.speed = v; anyFound = true; }
    }

    return anyFound ? result : null;
  }

  async add(value: TrackpadConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyTrackpadSettings(value);
  }

  async modify(newValue: TrackpadConfig, _previousValue: TrackpadConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyTrackpadSettings(newValue);
  }

  async remove(value: TrackpadConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    const $ = getPty();
    if ('speed' in value) await $.spawnSafe('defaults delete NSGlobalDomain com.apple.trackpad.scaling');
    CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings');
  }

  private async applyTrackpadSettings(settings: TrackpadConfig): Promise<void> {
    const $ = getPty();
    if (settings.speed !== undefined) {
      await $.spawn(`defaults write NSGlobalDomain com.apple.trackpad.scaling -float ${settings.speed}`);
    }
    CodifyCliSender.sendApplyNote(ApplyNotes.RESTART_REQUIRED, 'macos-settings');
  }
}

// ---- Dock ----

class DockSettingsParameter extends StatefulParameter<MacosSettingsConfig, DockConfig> {
  override getSettings() { return { isEqual }; }

  async refresh(desired: DockConfig | null, _config: Partial<MacosSettingsConfig>): Promise<DockConfig | null> {
    if (!desired) return null;
    const result: DockConfig = {};
    let anyFound = false;

    if ('position' in desired) {
      const v = await readString('com.apple.dock', 'orientation');
      if (v !== null) { result.position = v as DockConfig['position']; anyFound = true; }
    }
    if ('iconSize' in desired) {
      const v = await readInt('com.apple.dock', 'tilesize');
      if (v !== null) { result.iconSize = v; anyFound = true; }
    }
    if ('autohide' in desired) {
      const v = await readBool('com.apple.dock', 'autohide');
      if (v !== null) { result.autohide = v; anyFound = true; }
    }
    if ('hoverDelay' in desired) {
      const v = await readFloat('com.apple.dock', 'autohide-delay');
      if (v !== null) { result.hoverDelay = v; anyFound = true; }
    }
    if ('animationSpeed' in desired) {
      const v = await readFloat('com.apple.dock', 'autohide-time-modifier');
      if (v !== null) { result.animationSpeed = v; anyFound = true; }
    }
    if ('showRecents' in desired) {
      const v = await readBool('com.apple.dock', 'show-recents');
      if (v !== null) { result.showRecents = v; anyFound = true; }
    }
    if ('minimizeEffect' in desired) {
      const v = await readString('com.apple.dock', 'mineffect');
      if (v !== null) { result.minimizeEffect = v as DockConfig['minimizeEffect']; anyFound = true; }
    }

    return anyFound ? result : null;
  }

  async add(value: DockConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyDockSettings(value);
  }

  async modify(newValue: DockConfig, _previousValue: DockConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
    await this.applyDockSettings(newValue);
  }

  async remove(value: DockConfig, _plan: Plan<MacosSettingsConfig>): Promise<void> {
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
      if (prop in value) {
        await $.spawnSafe(`defaults delete com.apple.dock "${key}"`);
      }
    }
    await $.spawnSafe('killall Dock');
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
}

// ---- Resource ----

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
        mouse:    { type: 'stateful', definition: new MouseSettingsParameter(),    order: 1 },
        keyboard: { type: 'stateful', definition: new KeyboardSettingsParameter(), order: 2 },
        trackpad: { type: 'stateful', definition: new TrackpadSettingsParameter(), order: 3 },
        dock:     { type: 'stateful', definition: new DockSettingsParameter(),     order: 4 },
      },
      importAndDestroy: {
        preventDestroy: true,
      },
    };
  }

  override async refresh(_parameters: Partial<MacosSettingsConfig>): Promise<Partial<MacosSettingsConfig> | null> {
    return {};
  }

  async create(): Promise<void> {}

  async destroy(): Promise<void> {}
}
