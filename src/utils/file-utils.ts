import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import os, { homedir } from 'node:os';
import path from 'node:path';

import { Utils } from '@codifycli/plugin-core';

const SPACE_REGEX = /^\s*$/

export class FileUtils {
  static async addToStartupFile(line: string): Promise<void> {
    const lineToInsert = addLeadingSpacer(
      addTrailingSpacer(line)
    );

    const shellRc = Utils.getPrimaryShellRc()

    console.log(`Adding to ${path.basename(shellRc)}: ${lineToInsert}`)

    await fs.appendFile(shellRc, lineToInsert)

    function addLeadingSpacer(line: string): string {
      return line.startsWith('\n')
        ? line
        : '\n' + line;
    }

    function addTrailingSpacer(line: string): string {
      return line.endsWith('\n')
        ? line
        : line + '\n';
    }
  }

  static async addAllToStartupFile(lines: (string | undefined)[]): Promise<void> {
    const formattedLines = '\n' + lines.filter(Boolean).join('\n') + '\n';
    const shellRc = Utils.getPrimaryShellRc();

    console.log(`Adding to ${path.basename(shellRc)}:
${lines.join('\n')}`)

    await fs.appendFile(shellRc, formattedLines)
  }

  static async addPathToPrimaryShellRc(value: string, prepend: boolean): Promise<void> {
    const shellRc = Utils.getPrimaryShellRc();
    console.log(`Saving path: ${value} to ${shellRc}`);

    if (prepend) {
      await fs.appendFile(shellRc, `\nexport PATH=$PATH:${value};`, { encoding: 'utf8' });
      return;
    }

    await fs.appendFile(shellRc, `\nexport PATH=${value}:$PATH;`, { encoding: 'utf8' });
  }

  static async dirExists(path: string): Promise<boolean> {
    let stat;
    try {
      stat = await fs.stat(path);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  static async fileExists(path: string): Promise<boolean> {
    let stat;
    try {
      stat = await fs.stat(path);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  static async exists(path: string): Promise<boolean> {
    try {
      await fs.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  static async checkDirExistsOrThrowIfFile(path: string): Promise<boolean> {
    let stat;
    try {
      stat = await fs.stat(path);
    } catch {
      return false;
    }

    if (stat.isDirectory()) {
      return true;
    }
 
    throw new Error(`Directory ${path} already exists and is a file`);
  }

  static async createDirIfNotExists(path: string): Promise<void> {
    if (!fsSync.existsSync(path)){
      await fs.mkdir(path, { recursive: true });
    }
  }

  static homeDir(): string {
    return os.homedir()
  }

  static async removeFromFile(filePath: string, search: string): Promise<void> {
    const contents = await fs.readFile(filePath, 'utf8');
    const newContents = contents.replaceAll(search, '');

    await fs.writeFile(filePath, newContents, 'utf8');
  }

  static async removeBlockFromFile(filePath: string, startMarker: string, endMarker: string): Promise<void> {
    const file = await fs.readFile(filePath, 'utf8');
    const lines = file.split('\n');

    const start = lines.findIndex((l) => l.trim() === startMarker);
    if (start === -1) {
      return;
    }

    const relativeEnd = lines.slice(start + 1).findIndex((l) => l.trim() === endMarker);
    if (relativeEnd === -1) {
      return;
    }

    lines.splice(start, relativeEnd + 2);

    await fs.writeFile(filePath, lines.join('\n'), 'utf8');
    console.log(`Removed block ${startMarker} to ${endMarker} from ${filePath}`);
  }

  /**
   * Removes a shell `case ... esac` statement whose body references the given variable.
   *
   * `pnpm setup` emits a PATH guard of the form:
   *
   *     case ":$PATH:" in
   *       *":$PNPM_HOME:"*) ;;
   *       *) export PATH="$PNPM_HOME:$PATH" ;;
   *     esac
   *
   * The inner lines differ between pnpm versions and between platforms (`$PNPM_HOME` vs
   * `$PNPM_HOME/bin`, differing indentation), and on Linux the block is sometimes written with no
   * `# pnpm end` marker, so neither exact-text nor marker-range removal catches it. Matching on
   * the variable reference and then consuming through `esac` handles every layout.
   */
  static async removeCaseStatementReferencing(filePath: string, variable: string): Promise<void> {
    const file = await fs.readFile(filePath, 'utf8');
    const lines = file.split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]?.trim().startsWith('case ')) {
        continue;
      }

      // Find the matching `esac`, bailing out if the statement is unterminated.
      let end = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j]?.trim() === 'esac') {
          end = j;
          break;
        }

        if (lines[j]?.trim().startsWith('case ')) {
          break;
        }
      }

      if (end === -1) {
        continue;
      }

      const body = lines.slice(i, end + 1).join('\n');
      if (body.includes(variable)) {
        lines.splice(i, end - i + 1);
      }
    }

    await fs.writeFile(filePath, lines.join('\n'), 'utf8');
    console.log(`Removed case statement referencing ${variable} from ${filePath}`);
  }


  static async removeLineFromFile(filePath: string, search: RegExp | string): Promise<void> {
    const file = await fs.readFile(filePath, 'utf8')
    const lines = file.split('\n');

    let searchRegex;
    let searchString;

    if (typeof search === 'object') {
      const startRegex = /^([\t ]*)?/;
      const endRegex = /([\t ]*)?/;

      // Augment regex with spaces criteria to make sure this function is not deleting lines that are comments or has other content.
      searchRegex = search
        ? new RegExp(
          startRegex.source + search.source + endRegex.source,
          search.flags
        )
        : search;
    }

    if (typeof search === 'string') {
      searchString = search;
    }

    for (let counter = lines.length; counter >= 0; counter--) {
      if (!lines[counter]) {
        continue;
      }

      if (searchString && lines[counter].includes(searchString)) {
        lines.splice(counter, 1);
        continue;
      }

      if (searchRegex && lines[counter].search(searchRegex) !== -1) {
        lines.splice(counter, 1);
      }
    }

    await fs.writeFile(filePath, lines.join('\n'));
    console.log(`Removed line: ${search} from ${filePath}`)
  }

  static async removeLineFromStartupFile(search: RegExp | string): Promise<void> {
    return FileUtils.removeLineFromFile(Utils.getPrimaryShellRc(), search);
  }

  // Append the string to the end of a file ensuring at least 1 lines of space between.
  // Ex result:
  // something something;
  //
  // newline;
  static appendToFileWithSpacing(file: string, textToInsert: string): string {
    const lines = file.trimEnd().split(/\n/);
    if (lines.length === 0) {
      return textToInsert;
    }

    const endingNewLines = FileUtils.calculateEndingNewLines(lines);
    const numNewLines = endingNewLines === -1
      ? 0
      : Math.max(0, 2 - endingNewLines);
    return lines.join('\n') + '\n'.repeat(numNewLines) + textToInsert
  }

  // This is overly complicated but it can be used to insert into any
  // position in the future
  private static calculateEndingNewLines(lines: string[]): number {
    let counter = 0;
    while(true) {
      const line = lines.at(-counter - 1);

      if (!line) {
        return -1
      }

      if (!SPACE_REGEX.test(line)) {
        return counter;
      }

      counter++;

      // Short circuit here because we don't need to check over 2;
      if (counter > 2) {
        return counter;
      }
    }
  }
}
