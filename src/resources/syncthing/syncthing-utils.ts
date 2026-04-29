import { SpawnStatus, getPty } from '@codifycli/plugin-core';

const DAEMON_POLL_INTERVAL_MS = 500;

/**
 * Checks whether the Syncthing daemon is reachable via its CLI.
 * The CLI connects to the running daemon's REST API internally.
 */
export async function isDaemonRunning(): Promise<boolean> {
  const $ = getPty();
  const { status } = await $.spawnSafe('syncthing cli show system');
  return status === SpawnStatus.SUCCESS;
}

/**
 * Polls until the Syncthing daemon becomes reachable or the timeout is exceeded.
 */
export async function waitForDaemon(maxMs = 30_000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    if (await isDaemonRunning()) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, DAEMON_POLL_INTERVAL_MS));
  }

  throw new Error(`Syncthing daemon did not become ready within ${maxMs}ms`);
}

/**
 * Gets a single config value via the Syncthing CLI.
 * Returns undefined when the daemon is unreachable or the key doesn't exist.
 */
export async function getCliConfigValue(cliPath: string): Promise<string | undefined> {
  const $ = getPty();
  const { status, data } = await $.spawnSafe(`syncthing cli config ${cliPath} get`);
  return status === SpawnStatus.SUCCESS ? data.trim() : undefined;
}

/**
 * Sets a single config value via the Syncthing CLI.
 */
export async function setCliConfigValue(cliPath: string, value: string): Promise<void> {
  const $ = getPty();
  await $.spawn(`syncthing cli config ${cliPath} set -- ${value}`, { interactive: true });
}

/** Reads a boolean config value; returns undefined when unavailable. */
export async function getCliConfigBool(cliPath: string): Promise<boolean | undefined> {
  const raw = await getCliConfigValue(cliPath);
  if (raw === undefined) return undefined;
  return raw.toLowerCase() === 'true';
}

/** Reads a numeric config value; returns undefined when unavailable. */
export async function getCliConfigNumber(cliPath: string): Promise<number | undefined> {
  const raw = await getCliConfigValue(cliPath);
  if (raw === undefined) return undefined;
  const num = Number(raw);
  return isNaN(num) ? undefined : num;
}
