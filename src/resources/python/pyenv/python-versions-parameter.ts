import { ArrayStatefulParameter, getPty, SpawnStatus } from '@codifycli/plugin-core';

import { PyenvConfig } from './pyenv.js';

export class PythonVersionsParameter extends ArrayStatefulParameter<PyenvConfig, string> {
  override async refresh(desired: string[]): Promise<string[] | null> {
    const $ = getPty();

    const { data } = await $.spawnSafe('pyenv versions --bare --skip-aliases --skip-envs')

    const versions = data.split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Use pyenv latest to match the desired values to existing installed versions. The
    // reason behind this is that pyenv does special version processing during installs. For ex: specifying
    // pyenv install 3 will install the latest version 3.12.2
    for (const desiredVersion of desired ?? []) {
      const { status, data } = await $.spawnSafe(`pyenv latest ${desiredVersion}`);

      if (status !== SpawnStatus.SUCCESS) {
        continue;
      }

      const matchedVersion = data.trim();

      if (versions.includes(matchedVersion)) {
        const index = versions.indexOf(matchedVersion);
        versions.splice(index, 1, desiredVersion);
      }
    }

    return versions;
  }

  override async addItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pyenv install ${version} -s`, { interactive: true });
  }

  override async removeItem(version: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`pyenv uninstall ${version} -f`, { interactive: true });
  }
}
