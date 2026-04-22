import { ArrayStatefulParameter, getPty, Plan, SpawnStatus, Utils } from '@codifycli/plugin-core';

import { OllamaConfig } from './ollama.js';

async function ensureOllamaServerRunning(): Promise<void> {
  const $ = getPty();

  // Check if the server is already reachable
  const { status } = await $.spawnSafe('ollama list');
  if (status === SpawnStatus.SUCCESS) {
    return;
  }

  // Start the server as a background service
  if (Utils.isMacOS()) {
    await $.spawn('brew services start ollama', { interactive: true });
  } else {
    await $.spawn('systemctl start ollama', { interactive: true, requiresRoot: true });
  }

  // Give the server a moment to become ready
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

export class ModelsParameter extends ArrayStatefulParameter<OllamaConfig, string> {

  override getSettings() {
    return {
      type: 'array' as const,
      isElementEqual: (desired: string, current: string) => {
        // Normalize tags: "llama3.2" equals "llama3.2:latest"
        const normalize = (name: string) =>
          name.includes(':') ? name : `${name}:latest`;

        return normalize(desired) === normalize(current);
      },
    };
  }

  async refresh(_desired: string[] | null): Promise<string[] | null> {
    const $ = getPty();

    const { status, data } = await $.spawnSafe('ollama list');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    return parseOllamaList(data);
  }

  async addItem(item: string, _plan: Plan<OllamaConfig>): Promise<void> {
    const $ = getPty();
    await ensureOllamaServerRunning();
    await $.spawn(`ollama pull ${item}`, { interactive: true });
  }

  async removeItem(item: string, _plan: Plan<OllamaConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`ollama rm ${item}`, { interactive: true });
  }
}

/**
 * Parses the output of `ollama list` into an array of model name strings (with tag).
 * Example output:
 *   NAME              ID            SIZE    MODIFIED
 *   llama3.2:latest   abc123...     2.0 GB  2 hours ago
 */
function parseOllamaList(output: string): string[] {
  const lines = output.split('\n').filter(Boolean);

  // Skip the header line
  const dataLines = lines.slice(1);

  return dataLines
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}
