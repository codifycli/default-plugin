import {
  ApplyNotes,
  CodifyCliSender,
  ExampleConfig,
  getPty,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { CargoPackagesParameter } from './cargo-packages-parameter.js';

const schema = z
  .object({
    cargoPackages: z
      .array(z.string())
      .describe(
        'Global CLI tools to install via cargo install (e.g. ["ripgrep", "bat@0.24.0"]). ' +
        'Use the name@version syntax to pin a specific version.'
      )
      .optional(),
  })
  .describe('rust resource — install Rust via rustup and manage global cargo packages');

export type RustConfig = z.infer<typeof schema>;

const defaultConfig: Partial<RustConfig> = {
  cargoPackages: [],
};

const exampleBasic: ExampleConfig = {
  title: 'Install Rust with common CLI tools',
  description: 'Install Rust via rustup and add widely-used CLI tools built with Rust.',
  configs: [
    {
      type: 'rust',
      cargoPackages: ['ripgrep', 'bat', 'fd-find'],
    },
  ],
};

const examplePinned: ExampleConfig = {
  title: 'Install Rust with pinned package versions',
  description: 'Install Rust via rustup and pin specific crate versions for reproducible tooling.',
  configs: [
    {
      type: 'rust',
      cargoPackages: ['ripgrep@14.1.0', 'bat@0.24.0'],
    },
  ],
};

export class RustResource extends Resource<RustConfig> {
  getSettings(): ResourceSettings<RustConfig> {
    return {
      id: 'rust',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBasic,
        example2: examplePinned,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      removeStatefulParametersBeforeDestroy: true,
      parameterSettings: {
        cargoPackages: { type: 'stateful', definition: new CargoPackagesParameter(), order: 1 },
      },
      dependencies: [...(Utils.isMacOS() ? ['xcode-tools'] : [])],
    };
  }

  async refresh(): Promise<Partial<RustConfig> | null> {
    const $ = getPty();
    const { status } = await $.spawnSafe('rustup --version');
    return status === SpawnStatus.SUCCESS ? {} : null;
  }

  async create(): Promise<void> {
    const $ = getPty();
    await $.spawn(
      "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
      { interactive: true }
    );

    CodifyCliSender.sendApplyNote(ApplyNotes.NEW_SHELL_REQUIRED);
  }

  async destroy(): Promise<void> {
    const $ = getPty();
    await $.spawn('rustup self uninstall -y', { interactive: true });

    CodifyCliSender.sendApplyNote(ApplyNotes.NEW_SHELL_REQUIRED);
  }
}
