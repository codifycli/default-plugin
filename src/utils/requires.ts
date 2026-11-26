import { Utils } from '@codifycli/plugin-core';

export type MacOSPrerequisite = 'homebrew' | 'xcode-tools';

/**
 * Value for `requires` in getSettings(): the resources this resource needs on macOS. The CLI adds them when the config
 * doesn't declare them (homebrew itself requires xcode-tools, so `requiresOnMacOS('homebrew')` brings in both).
 *
 * - `homebrew`: installs or uninstalls with brew on macOS (`Utils.installViaPkgMgr`, `brew ...`).
 * - `xcode-tools` (Xcode Command Line Tools): runs git, make, clang or python3 from /usr/bin. On a fresh Mac those are
 *   stubs that open an "install developer tools" dialog, and `which git` still succeeds.
 */
export function requiresOnMacOS(...types: MacOSPrerequisite[]): string[] {
  return Utils.isMacOS() ? types : [];
}
