import {
  CreatePlan,
  FileUtils,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { Utils } from '../../utils/index.js';
import { ModelsParameter } from './models-parameter.js';

const schema = z
  .object({
    models: z
      .array(z.string())
      .describe(
        'AI models to pull and keep installed (e.g. "llama3.2", "mistral:7b"). ' +
        'See https://ollama.com/library for the full model catalogue.'
      )
      .optional(),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/ollama/ollama' })
  .describe('Ollama resource for installing and managing the Ollama LLM runtime and its models');

export type OllamaConfig = z.infer<typeof schema>;

export class OllamaResource extends Resource<OllamaConfig> {
  getSettings(): ResourceSettings<OllamaConfig> {
    return {
      id: 'ollama',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['homebrew'],
      parameterSettings: {
        models: { type: 'stateful', definition: new ModelsParameter() },
      },
    };
  }

  async refresh(_parameters: Partial<OllamaConfig>): Promise<Partial<OllamaConfig> | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which ollama');
    if (status !== SpawnStatus.SUCCESS) {
      return null;
    }

    return {};
  }

  async create(plan: CreatePlan<OllamaConfig>): Promise<void> {
    if (Utils.isMacOS()) {
      await this.installOnMacOs();
    } else {
      await this.installOnLinux();
    }
  }

  async destroy(): Promise<void> {
    if (Utils.isMacOS()) {
      await this.uninstallOnMacOs();
    } else {
      await this.uninstallOnLinux();
    }
  }

  // ── macOS ──────────────────────────────────────────────────────────────────

  private async installOnMacOs(): Promise<void> {
    const $ = getPty();

    if (!(await Utils.isHomebrewInstalled())) {
      throw new Error(
        'Homebrew is not installed. Please install Homebrew before installing Ollama.'
      );
    }

    await $.spawn('brew install ollama', {
      interactive: true,
      env: { HOMEBREW_NO_AUTO_UPDATE: 1 },
    });

    // Start the Ollama server as a background service
    await $.spawn('brew services start ollama', { interactive: true });
  }

  private async uninstallOnMacOs(): Promise<void> {
    const $ = getPty();

    // Stop the service before removing the binary
    await $.spawnSafe('brew services stop ollama');

    if (await Utils.isHomebrewInstalled()) {
      await $.spawnSafe('brew uninstall ollama', {
        env: { HOMEBREW_NO_AUTO_UPDATE: 1 },
      });
    }
  }

  // ── Linux ──────────────────────────────────────────────────────────────────

  private async installOnLinux(): Promise<void> {
    const $ = getPty();

    // The official install script installs the binary, creates the `ollama`
    // system user, and registers + starts a systemd service automatically.
    await $.spawn(
      'curl -fsSL https://ollama.com/install.sh | sh',
      { interactive: true }
    );
  }

  private async uninstallOnLinux(): Promise<void> {
    const $ = getPty();

    await $.spawnSafe('sudo systemctl stop ollama');
    await $.spawnSafe('sudo systemctl disable ollama');
    await $.spawnSafe('sudo rm -f /etc/systemd/system/ollama.service');
    await $.spawnSafe('sudo rm -f /usr/local/bin/ollama');

    // Remove model data and configuration
    await $.spawnSafe('sudo rm -rf /usr/share/ollama');
    await $.spawnSafe('sudo userdel ollama');
    await $.spawnSafe('sudo groupdel ollama');
  }
}
