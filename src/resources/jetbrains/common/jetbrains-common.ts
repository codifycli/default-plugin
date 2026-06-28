import { ArrayStatefulParameter, getPty, Plan, SpawnStatus, Utils, PackageManager } from '@codifycli/plugin-core';
import { StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Static metadata describing a single JetBrains IDE product. Each product
 * resource (pycharm, clion, rider, ...) provides one of these to the shared
 * helper functions below so install/config-discovery/plugin-management logic
 * only needs to be written once.
 */
export interface JetBrainsProductInfo {
  /** Name of the .app bundle on macOS, without extension, e.g. 'PyCharm', 'IntelliJ IDEA'. */
  macAppName: string;
  /** Binary name inside `<app>.app/Contents/MacOS/`, e.g. 'pycharm', 'idea'. Also used as the CLI symlink name on macOS and as the `.vmoptions` file prefix. */
  macBinaryName: string;
  /** Prefix of the per-version config/plugins directory under `JetBrains/`, e.g. 'PyCharm', 'IntelliJIdea'. */
  configDirPrefix: string;
  /** Homebrew cask name, e.g. 'pycharm', 'intellij-idea'. */
  caskName: string;
  /** Snap package name (installed with `--classic`), e.g. 'pycharm-community', 'clion'. */
  snapName: string;
  /** CLI command name available on Linux after the snap is installed, e.g. 'pycharm-community', 'clion'. */
  linuxCommand: string;
}

export class JetBrainsCommon {
  static getMacAppPath(product: JetBrainsProductInfo): string {
    return `/Applications/${product.macAppName}.app`;
  }

  static getMacBinary(product: JetBrainsProductInfo): string {
    return `${JetBrainsCommon.getMacAppPath(product)}/Contents/MacOS/${product.macBinaryName}`;
  }

  static getBinary(product: JetBrainsProductInfo): string {
    return Utils.isMacOS() ? JetBrainsCommon.getMacBinary(product) : product.linuxCommand;
  }

  private static getJetBrainsParentDir(): string {
    return Utils.isMacOS()
      ? path.join(os.homedir(), 'Library', 'Application Support', 'JetBrains')
      : path.join(os.homedir(), '.config', 'JetBrains');
  }

  static async findConfigDir(product: JetBrainsProductInfo): Promise<string | null> {
    const parentDir = JetBrainsCommon.getJetBrainsParentDir();

    try {
      const entries = await fs.readdir(parentDir);
      const dirs = entries.filter((e) => e.startsWith(product.configDirPrefix)).sort();
      return dirs.length > 0 ? path.join(parentDir, dirs[dirs.length - 1]) : null;
    } catch {
      return null;
    }
  }

  static async getOrCreateConfigDir(product: JetBrainsProductInfo): Promise<string | null> {
    const existing = await JetBrainsCommon.findConfigDir(product);
    if (existing) return existing;

    const version = await JetBrainsCommon.getMajorMinorVersion(product);
    if (!version) return null;

    const parentDir = JetBrainsCommon.getJetBrainsParentDir();
    const configDir = path.join(parentDir, `${product.configDirPrefix}${version}`);
    await fs.mkdir(configDir, { recursive: true });
    return configDir;
  }

  private static async getMajorMinorVersion(product: JetBrainsProductInfo): Promise<string | null> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      const result = await $.spawnSafe(
        `/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "${JetBrainsCommon.getMacAppPath(product)}/Contents/Info.plist"`
      );
      if (result.status !== SpawnStatus.SUCCESS) return null;
      const parts = result.data.trim().split('.');
      return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
    }

    if (Utils.isLinux()) {
      const result = await $.spawnSafe(`snap list ${product.snapName}`);
      if (result.status !== SpawnStatus.SUCCESS) return null;
      const lines = result.data.split('\n');
      const line = lines.find((l) => l.startsWith(product.snapName));
      const match = line?.match(/(\d+\.\d+)/);
      return match ? match[1] : null;
    }

    return null;
  }

  static getPluginsDir(product: JetBrainsProductInfo, configDir: string): string {
    // macOS: plugins are in a `plugins/` subdir of the config dir
    // Linux: plugins are in ~/.local/share/JetBrains/<Product><Version>/ directly
    if (Utils.isMacOS()) {
      return path.join(configDir, 'plugins');
    }
    // For Linux, derive from config dir path by swapping .config -> .local/share
    const version = path.basename(configDir);
    return path.join(os.homedir(), '.local', 'share', 'JetBrains', version);
  }

  static getBundledPluginsDir(product: JetBrainsProductInfo): string | null {
    if (Utils.isMacOS()) return path.join(JetBrainsCommon.getMacAppPath(product), 'Contents', 'plugins');
    if (Utils.isLinux()) return `/snap/${product.snapName}/current/plugins`;
    return null;
  }

  static async readPluginIdFromDir(pluginDir: string): Promise<string | null> {
    // Try plain META-INF/plugin.xml first (user-installed plugins unzipped as directories)
    const xmlPath = path.join(pluginDir, 'META-INF', 'plugin.xml');
    try {
      const content = await fs.readFile(xmlPath, 'utf8');
      const match = content.match(/<id>([^<]+)<\/id>/);
      if (match) return match[1].trim();
    } catch { /* fall through to JAR search */ }

    // Bundled plugins ship as directories containing JAR files in lib/.
    // Requires unzip; skip silently if not available.
    const $ = getPty();
    const unzipCheck = await $.spawnSafe('which unzip');
    if (unzipCheck.status !== SpawnStatus.SUCCESS) return null;

    const tryReadIdFromJars = async (subdir: string): Promise<string> => {
      const libDir = subdir === '.' ? pluginDir : path.join(pluginDir, subdir);
      const entries = await fs.readdir(libDir);
      const pluginName = path.basename(pluginDir).toLowerCase();
      // Try the JAR named after the plugin dir first - it's almost always the main one
      const jars = entries
        .filter((e) => e.endsWith('.jar'))
        .sort((a, b) => {
          const aMatch = a.toLowerCase().startsWith(pluginName) ? -1 : 0;
          const bMatch = b.toLowerCase().startsWith(pluginName) ? -1 : 0;
          return aMatch - bMatch;
        });
      for (const entry of jars) {
        const result = await $.spawnSafe(`unzip -p "${path.join(libDir, entry)}" META-INF/plugin.xml`);
        if (result.status !== SpawnStatus.SUCCESS || !result.data) continue;
        const match = result.data.match(/<id>([^<]+)<\/id>/);
        if (match) return match[1].trim();
      }
      throw new Error('no id');
    };

    const results = await Promise.allSettled(['lib', '.'].map(tryReadIdFromJars));
    for (const r of results) {
      if (r.status === 'fulfilled') return r.value;
    }

    return null;
  }

  // ── vmoptions file helpers ──────────────────────────────────────────────────

  static async readVmOptions(product: JetBrainsProductInfo, configDir: string): Promise<{ maxHeap?: string; minHeap?: string }> {
    try {
      const content = await fs.readFile(path.join(configDir, `${product.macBinaryName}.vmoptions`), 'utf8');
      const lines = content.split('\n');
      const maxHeap = lines.find((l) => l.startsWith('-Xmx'))?.slice('-Xmx'.length).trim();
      const minHeap = lines.find((l) => l.startsWith('-Xms'))?.slice('-Xms'.length).trim();
      return { maxHeap, minHeap };
    } catch {
      return {};
    }
  }

  static async writeVmOptions(product: JetBrainsProductInfo, configDir: string, maxHeap?: string, minHeap?: string): Promise<void> {
    const optionsPath = path.join(configDir, `${product.macBinaryName}.vmoptions`);
    let lines: string[] = [];

    try {
      lines = (await fs.readFile(optionsPath, 'utf8')).split('\n');
    } catch { /* file doesn't exist yet */ }

    lines = lines.filter((l) => !l.startsWith('-Xmx') && !l.startsWith('-Xms'));
    if (maxHeap) lines.push(`-Xmx${maxHeap}`);
    if (minHeap) lines.push(`-Xms${minHeap}`);

    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(optionsPath, lines.join('\n').trim() + '\n');
  }

  static async removeVmOptions(product: JetBrainsProductInfo, configDir: string): Promise<void> {
    const optionsPath = path.join(configDir, `${product.macBinaryName}.vmoptions`);
    try {
      const lines = (await fs.readFile(optionsPath, 'utf8'))
        .split('\n')
        .filter((l) => !l.startsWith('-Xmx') && !l.startsWith('-Xms'));
      const content = lines.join('\n').trim();
      if (content) {
        await fs.writeFile(optionsPath, content + '\n');
      } else {
        await fs.rm(optionsPath, { force: true });
      }
    } catch { /* nothing to remove */ }
  }

  // ── install / uninstall ────────────────────────────────────────────────────

  static async isInstalled(product: JetBrainsProductInfo): Promise<boolean> {
    if (Utils.isMacOS()) {
      try {
        await fs.access(JetBrainsCommon.getMacBinary(product));
        return true;
      } catch {
        return false;
      }
    }

    const $ = getPty();
    const result = await $.spawnSafe(`which ${product.linuxCommand}`);
    return result.status === SpawnStatus.SUCCESS;
  }

  static async installMacOS(product: JetBrainsProductInfo): Promise<void> {
    const $ = getPty();
    await Utils.installViaPkgMgr(product.caskName, { [PackageManager.BREW]: { cask: true } }, PackageManager.BREW);
    // Create a CLI launcher symlink so `<macBinaryName>` works from the terminal
    await $.spawnSafe(
      `ln -sf "${JetBrainsCommon.getMacBinary(product)}" /usr/local/bin/${product.macBinaryName}`,
      { requiresRoot: true }
    );
  }

  static async uninstallMacOS(product: JetBrainsProductInfo): Promise<void> {
    const $ = getPty();
    await Utils.uninstallViaPkgMgr(product.caskName, { [PackageManager.BREW]: { cask: true } }, PackageManager.BREW);
    await $.spawnSafe(`rm -f /usr/local/bin/${product.macBinaryName}`, { requiresRoot: true });
  }

  static async installLinux(product: JetBrainsProductInfo): Promise<void> {
    const $ = getPty();
    const snapCheck = await $.spawnSafe('which snap');
    if (snapCheck.status !== SpawnStatus.SUCCESS) {
      await Utils.installViaPkgMgr('snapd');
    }
    await $.spawn(`snap install ${product.snapName} --classic`, {
      interactive: true,
      requiresRoot: true,
    });
    // unzip is needed to read plugin IDs from bundled JAR files
    await Utils.installViaPkgMgr('unzip');
  }

  static async uninstallLinux(product: JetBrainsProductInfo): Promise<void> {
    const $ = getPty();
    await $.spawnSafe(`snap remove ${product.snapName}`, { requiresRoot: true });
  }
}

// ── plugins ──────────────────────────────────────────────────────────────────

/**
 * Stateful parameter that manages a JetBrains IDE's installed plugin list.
 * `C` is the resource's config type, which must include an optional `plugins?: string[]` field.
 */
export class JetBrainsPluginsParameter<C extends StringIndexedObject> extends ArrayStatefulParameter<C, string> {
  constructor(private readonly product: JetBrainsProductInfo) {
    super();
  }

  override getSettings() {
    return {
      type: 'array' as const,
      isElementEqual: (desired: string, current: string) =>
        desired.toLowerCase() === current.toLowerCase(),
    };
  }

  override async refresh(desired: string[] | null): Promise<string[] | null> {
    const readIdsFromDir = async (dir: string): Promise<string[]> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results = await Promise.all(
        entries
          .filter((e) => e.isDirectory())
          .map((e) => JetBrainsCommon.readPluginIdFromDir(path.join(dir, e.name)))
      );
      return results.filter((id): id is string => id != null);
    };

    const [configDir, bundledDir] = await Promise.all([
      JetBrainsCommon.findConfigDir(this.product),
      Promise.resolve(JetBrainsCommon.getBundledPluginsDir(this.product)),
    ]);

    if (!configDir && !bundledDir) return null;

    const userIds = configDir
      ? await readIdsFromDir(JetBrainsCommon.getPluginsDir(this.product, configDir)).catch(() => [] as string[])
      : [];

    // Only check the bundled dir for desired plugins not found in the user dir,
    // to avoid flooding refresh with all default-installed bundled plugins.
    if (bundledDir && desired) {
      const missing = desired.filter((d) => !userIds.some((u) => u.toLowerCase() === d.toLowerCase()));
      if (missing.length > 0) {
        const bundledEntries = await fs.readdir(bundledDir, { withFileTypes: true }).catch(() => []);
        const bundledIds = await Promise.all(
          bundledEntries
            .filter((e) => e.isDirectory())
            .map((e) => JetBrainsCommon.readPluginIdFromDir(path.join(bundledDir, e.name)))
        );
        for (const id of bundledIds) {
          if (id && missing.some((m) => m.toLowerCase() === id.toLowerCase())) {
            userIds.push(id);
          }
        }
      }
    }

    return userIds;
  }

  async addItem(item: string, _plan: Plan<C>): Promise<void> {
    // If the plugin is already present in the bundled plugins dir, skip installation.
    // On Linux the snap binary fails headlessly with XDG_RUNTIME_DIR errors, so
    // we must not call it for plugins that are already bundled.
    const bundledDir = JetBrainsCommon.getBundledPluginsDir(this.product);
    if (bundledDir) {
      try {
        const entries = await fs.readdir(bundledDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const id = await JetBrainsCommon.readPluginIdFromDir(path.join(bundledDir, entry.name));
          if (id?.toLowerCase() === item.toLowerCase()) return;
        }
      } catch { /* bundled dir inaccessible, fall through to install */ }
    }

    const $ = getPty();
    const binary = JetBrainsCommon.getBinary(this.product);
    try {
      await $.spawn(`"${binary}" installPlugins ${item}`, { interactive: true });
    } catch (e: unknown) {
      const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
      if (msg.includes('already installed')) return;
      if (msg.includes('one instance') || msg.includes('already running') || msg.includes('already open')) {
        throw new Error(`${this.product.macAppName} is currently open. JetBrains IDEs only allow one instance open at a time. Please close it and re-run.`);
      }
      throw e;
    }
  }

  async removeItem(item: string, _plan: Plan<C>): Promise<void> {
    const configDir = await JetBrainsCommon.findConfigDir(this.product);
    if (!configDir) return;

    const pluginsDir = JetBrainsCommon.getPluginsDir(this.product, configDir);
    try {
      const entries = await fs.readdir(pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const id = await JetBrainsCommon.readPluginIdFromDir(path.join(pluginsDir, entry.name));
        if (id?.toLowerCase() === item.toLowerCase()) {
          await fs.rm(path.join(pluginsDir, entry.name), { recursive: true, force: true });
          return;
        }
      }
    } catch { /* plugin dir doesn't exist, nothing to remove */ }
  }
}
