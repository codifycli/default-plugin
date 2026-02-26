import { getPty, StatefulParameter, SpawnStatus } from '@codifycli/plugin-core';

import { GitConfig } from './git-resource.js';

export class GitNameParameter extends StatefulParameter<GitConfig, string> {

  async refresh(): Promise<null | string> {
    const $ = getPty()

    const { data: name, status } = await $.spawnSafe('git config --global user.name')
    return status === SpawnStatus.ERROR ? null : name.trim()
  }

  async add(valueToAdd: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`git config --global user.name "${valueToAdd}"`)
  }

  async modify(newValue: string): Promise<void> {
    const $ = getPty();
    await $.spawn(`git config --global user.name "${newValue}"`)
  }

  async remove(): Promise<void> {
    const $ = getPty();
    await $.spawn('git config --global --unset user.name')
  }
}
