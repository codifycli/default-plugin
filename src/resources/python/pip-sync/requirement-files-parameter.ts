import { ArrayParameterSetting, Plan, StatefulParameter, getPty } from '@codifycli/plugin-core';

import { PipSyncConfig } from './pip-sync.js';

export class RequirementFilesParameter extends StatefulParameter<PipSyncConfig, string[]> {
  getSettings(): ArrayParameterSetting {
    return {
      type: 'array',
      itemType: 'directory',
      canModify: true,
    }
  }

  async refresh(desired: null | string[], config: Partial<PipSyncConfig>): Promise<null | string[]> {
    if (!desired || desired?.length === 0) {
      return null;
    }
    
    const pty = getPty();
    const { status } = await pty.spawnSafe(
      this.appendVirtualEnv(`pip-sync -n ${desired?.join(' ')}`, config.virtualEnv),
      { cwd: config.cwd ?? undefined }
    )
    return status === 'error' ? null : desired;
  }

  async add(valueToAdd: string[], plan: Plan<PipSyncConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(
      this.appendVirtualEnv(`pip-sync ${valueToAdd.join(' ')}`, plan.desiredConfig?.virtualEnv),
      { cwd: plan.desiredConfig?.cwd ?? undefined, interactive: true }
    )
  }

  async modify(newValue: string[], _: string[], plan: Plan<PipSyncConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(
      this.appendVirtualEnv(`pip-sync ${newValue.join(' ')}`, plan.desiredConfig?.virtualEnv),
      { cwd: plan.desiredConfig?.cwd ?? undefined, interactive: true }
    )
  }

  async remove(valueToRemove: string[], plan: Plan<PipSyncConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(
      this.appendVirtualEnv(`pip-sync ${valueToRemove.join(' ')}`, plan.currentConfig?.virtualEnv),
      { cwd: plan.currentConfig?.cwd ?? undefined, interactive: true }
    )
  }

  private appendVirtualEnv(command: string, virtualEnv?: string): string {
    if (!virtualEnv) {
      return command;
    }

    return `( set -e; source ${virtualEnv}/bin/activate; ${command} --python-executable ${virtualEnv}/bin/python; deactivate )`
  }
}
