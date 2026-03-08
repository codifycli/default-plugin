import * as os from 'node:os';
import * as path from 'node:path';

export class TestUtils {
  /**
   * Get the current shell type (bash or zsh)
   */
  static getShell(): 'bash' | 'zsh' {
    const shell = process.env.SHELL || '';

    if (shell.includes('bash')) {
      return 'bash';
    }

    if (shell.includes('zsh')) {
      return 'zsh';
    }

    // Default to bash for tests
    return 'bash';
  }

  /**
   * Get the primary shell rc file path
   */
  static getPrimaryShellRc(): string {
    const shell = TestUtils.getShell();
    const homeDir = os.homedir();

    if (shell === 'bash') {
      return path.join(homeDir, '.bashrc')
    }

    if (shell === 'zsh') {
      return path.join(homeDir, '.zshrc');
    }

    throw new Error('Unsupported shell')
  }

  /**
   * Get the source command for the shell rc file
   * Usage: execSync(TestUtils.getSourceCommand())
   */
  static getSourceCommand(): string {
    return `source ${TestUtils.getPrimaryShellRc()}`;
  }

  /**
   * Get shell-specific command to run with sourced environment
   * Usage: execSync(TestUtils.getShellCommand('which brew'))
   */
  static getShellCommand(command: string): string {
    return `${TestUtils.getSourceCommand()}; ${command}`;
  }

  /**
   * Get shell name for execSync shell option
   */
  static getShellName(): string {
    return TestUtils.getShell();
  }

  /**
   * Get interactive shell command
   * Usage: execSync(TestUtils.getInteractiveCommand('my-alias'))
   */
  static getInteractiveCommand(command: string): string {
    const shell = TestUtils.getShell();

    return shell === 'bash'
      ? `bash -i -c "${command}"`
      : `zsh -i -c "${command}"`;
  }

  /**
   * Get which command output format based on shell
   */
  static getAliasWhichCommand(aliasName: string): string {
    const shell = TestUtils.getShell();

    // zsh outputs: "alias_name: aliased to command"
    // bash outputs: "alias alias_name='command'"
    return shell === 'bash'
      ? `${TestUtils.getShellCommand(`alias ${aliasName}`)}`
      : `${TestUtils.getShellCommand(`which ${aliasName}`)}`;
  }

  /**
   * Check if running on macOS
   */
  static isMacOS(): boolean {
    return os.platform() === 'darwin';
  }

  /**
   * Check if running on Linux
   */
  static isLinux(): boolean {
    return os.platform() === 'linux';
  }
}
