import { Ajv } from 'ajv';
import { SudoError, VerbosityLevel } from '@codifycli/plugin-core';
import {
  CommandRequestResponseData, CommandRequestResponseDataSchema,
  IpcMessageV2,
  MessageCmd,
} from 'codify-schemas';
import { nanoid } from 'nanoid';
import { SpawnOptions, spawn } from 'node:child_process';
import stripAnsi from 'strip-ansi';

import { Utils } from './index.js';

const ajv = new Ajv({
  strict: true,
});
const validateSudoRequestResponse = ajv.compile(CommandRequestResponseDataSchema);

export enum SpawnStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface SpawnResult {
  status: SpawnStatus,
  data: string;
}

type CodifySpawnOptions = {
  cwd?: string;
  throws?: boolean,
  requiresRoot?: boolean
  requestsTTY?: boolean,
} & Omit<SpawnOptions, 'detached' | 'shell' | 'stdio'>

/**
*
* @param cmd Command to run. Ex: `rm -rf`
* @param opts Standard options for node spawn. Additional argument:
* throws determines if a shell will throw a JS error. Defaults to true
*
* @see promiseSpawn
* @see spawn
*
* @returns SpawnResult { status: SUCCESS | ERROR; data: string }
*/
export async function codifySpawn(
  cmd: string,
  opts?: CodifySpawnOptions,
): Promise<SpawnResult> {
  const throws = opts?.throws ?? true;

  console.log(`Running command: ${cmd}` + (opts?.cwd ? `(${opts?.cwd})` : ''))

  try {
    // TODO: Need to benchmark the effects of using sh vs zsh for shell.
    //  Seems like zsh shells run slower

    const result = await (opts?.requiresRoot
      ? externalSpawnWithSudo(
        cmd,
        opts,
      )
      : internalSpawn(
        cmd,
        opts ?? {},
      ));
    
    if (result.status !== SpawnStatus.SUCCESS) {
      throw new Error(result.data);
    }

    return result;
  } catch (error) {

    if (isDebug()) {
      console.error(`CodifySpawn error for command ${cmd}`, error);
    }

    // @ts-ignore
    if (error.message?.startsWith('sudo:')) {
      throw new SudoError(cmd);
    }

    if (throws) {
      throw error;
    }

    if (error instanceof Error) {
      return {
        status: SpawnStatus.ERROR,
        data: error.message,
      }
    }

    return {
      status: SpawnStatus.ERROR,
      data: String(error),
    }
  }
}

async function internalSpawn(
  cmd: string,
  opts: CodifySpawnOptions
): Promise<{ status: SpawnStatus, data: string }>  {
  return new Promise((resolve) => {
    const output: string[] = [];

    // If TERM_PROGRAM=Apple_Terminal is set then ANSI escape characters may be included
    // in the response.
    const env = { ...process.env, ...opts.env, TERM_PROGRAM: 'codify', COMMAND_MODE: 'unix2003', COLORTERM: 'truecolor' }

    // Detect shell and appropriate rc file
    const shell = process.env.SHELL || '/bin/bash';
    const shellName = shell.includes('zsh') ? 'zsh' : 'bash';
    const shellRc = Utils.getPrimaryShellRc();

    // Source start up shells to emulate a users environment vs. a non-interactive non-login shell script
    // Ignore all stdin
    // If tty is requested then we'll need to sleep 1 to avoid race conditions. This is because if the terminal updates async after the tty message is
    // displayed then it'll disappear. By adding sleep 1 it'll allow ink.js to finish all the updates before the tty message is shown
    const _process = spawn(`source ${shellRc}; ${ opts.requestsTTY ? 'sleep 1;' : '' }${cmd}`, [], {
      ...opts,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: shellName,
      env
    });
    
    const { stdout, stderr, stdin } = _process
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');

    stdout.on('data', (data) => {
      output.push(data.toString());
    })

    stderr.on('data', (data) => {
      output.push(data.toString());
    })

    _process.on('error', (data) => {})

    // please node that this is not a full replacement for 'inherit'
    // the child process can and will detect if stdout is a pty and change output based on it
    // the terminal context is lost & ansi information (coloring) etc will be lost
    if (stdout && stderr && VerbosityLevel.get() > 0) {
      stdout.pipe(process.stdout)
      stderr.pipe(process.stderr)
    }

    _process.on('close', (code) => {
      resolve({
        status: code === 0 ? SpawnStatus.SUCCESS : SpawnStatus.ERROR,
        data: stripAnsi(output.join('\n')),
      })
    })
  })
}

async function externalSpawnWithSudo(
  cmd: string,
  opts: CodifySpawnOptions
): Promise<{ status: SpawnStatus, data: string }> {
  return new Promise((resolve) => {
    const requestId = nanoid(8);

    const listener = (data: IpcMessageV2)=> {
      if (data.requestId === requestId) {
        process.removeListener('message', listener);

        if (!validateSudoRequestResponse(data.data)) {
          throw new Error(`Invalid response for sudo request: ${JSON.stringify(validateSudoRequestResponse.errors, null, 2)}`);
        }

        resolve(data.data as unknown as CommandRequestResponseData);
      }
    }

    process.on('message', listener);

    process.send!(<IpcMessageV2>{
      cmd: MessageCmd.COMMAND_REQUEST,
      data: {
        command: cmd,
        options: opts ?? {},
      },
      requestId
    })
  });
}

export function isDebug(): boolean {
  return process.env.DEBUG != null && process.env.DEBUG.includes('codify'); // TODO: replace with debug library
}
