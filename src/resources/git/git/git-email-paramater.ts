import { getPty, StatefulParameter, SpawnStatus } from '@codifycli/plugin-core';

import { GitConfig } from './git-resource.js';

export class GitEmailParameter extends StatefulParameter<GitConfig, string> {

    async refresh(): Promise<null | string> {
      const $ = getPty();

      const { data: email, status } = await $.spawnSafe('git config --global user.email')
      return status === SpawnStatus.ERROR ? null : email.trim()
    }

    async add(valueToAdd: string): Promise<void> {
      const $ = getPty();
      await $.spawn(`git config --global user.email "${valueToAdd}"`)
    }

    async modify(newValue: string): Promise<void> {
      const $ = getPty();
      await $.spawn(`git config --global user.email "${newValue}"`)
    }

    async remove(): Promise<void> {
      const $ = getPty();
      await $.spawn('git config --global --unset user.email')
    }
}
