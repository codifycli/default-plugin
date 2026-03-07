import {
  CreatePlan,
  DestroyPlan,
  getPty,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';

import { FileUtils } from '../../../utils/file-utils.js';
import { Utils } from '../../../utils/index.js';
import Schema from './alias-schema.json';

export interface AliasConfig extends StringIndexedObject {
  alias: string;
  value: string;
}

export class AliasResource extends Resource<AliasConfig> {
  getSettings(): ResourceSettings<AliasConfig> {
    return {
      id: 'alias',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        value: { canModify: true }
      },
      importAndDestroy: {
        preventImport: true,
      },
      allowMultiple: {
        identifyingParameters: ['alias'],
      },
    }
  }

  override async refresh(parameters: Partial<AliasConfig>): Promise<Partial<AliasConfig> | null> {
    const $ = getPty();

    const { alias: desired } = parameters;
    const { data, status } = await $.spawnSafe(`alias ${desired}`)

    if (status === SpawnStatus.ERROR) {
      return null;
    }

    const matchedAlias = data.split(/\n/g)
      .find((l) => {
        const firstEqualIndex = l.indexOf('=');
        const name = l.slice(0, firstEqualIndex);
        return name.endsWith(desired!);
      });

    if (!matchedAlias) {
      return null;
    }

    const aliasMatch = matchedAlias.match(/^(?:alias\s+)?([^=]+)='?(.*?)'?$/);
    if (!aliasMatch) {
      return null;
    }

    const name = aliasMatch[1].trim();
    const value = aliasMatch[2].trim();

    return {
      alias: name,
      value,
    }
  }

  override async create(plan: CreatePlan<AliasConfig>): Promise<void> {
    const shellRcPath = Utils.getPrimaryShellRc();

    if (!(await FileUtils.fileExists(shellRcPath))) {
      await fs.writeFile(shellRcPath, '', { encoding: 'utf8' });
    }

    const { alias, value } = plan.desiredConfig;
    const aliasString = this.aliasString(alias, value);

    await FileUtils.addToStartupFile(aliasString);
  }

  async modify(pc: ParameterChange<AliasConfig>, plan: ModifyPlan<AliasConfig>): Promise<void> {
    if (pc.name !== 'value') {
      return;
    }

    const { alias, value } = plan.currentConfig;
    const aliasInfo = await this.findAlias(alias, value);
    if (!aliasInfo) {
      throw new Error(`Unable to find alias: ${alias} on the system. Codify isn't able to search all locations on the system. Please delete the alias manually and re-run Codify.`);
    }

    const aliasString = this.aliasString(alias, value);
    const aliasStringShort = this.aliasStringShort(alias, value);

    const lines = aliasInfo.contents.trimEnd().split(/\n/)

    const aliasLineNum = lines
      .findIndex((l) => l.trim() === aliasStringShort || l.trim() === aliasString);
    if (aliasLineNum === -1) {
      throw new Error(`Unable to modify Alias. Cannot find line ${aliasString} in ${aliasInfo.path}. Please delete the alias manually and re-run Codify.`);
    }
    
    const newAlias = this.aliasString(plan.desiredConfig.alias, plan.desiredConfig.value);
    lines.splice(aliasLineNum, 1, newAlias);
    
    await fs.writeFile(aliasInfo.path, lines.join('\n'), 'utf8');
  }

  async destroy(plan: DestroyPlan<AliasConfig>): Promise<void> {
    const { alias, value } = plan.currentConfig;
    const aliasInfo = await this.findAlias(alias, value);
    if (!aliasInfo) {
      throw new Error(`Unable to find alias: ${alias} on the system. Codify isn't able to search all locations on the system. Please delete the alias manually and re-run Codify.`);
    }

    const aliasString = this.aliasString(alias, value);
    const aliasStringShort = this.aliasStringShort(alias, value);
    
    await FileUtils.removeLineFromFile(aliasInfo.path, aliasString);
    await FileUtils.removeLineFromFile(aliasInfo.path, aliasStringShort);
  }

  private async findAlias(alias: string, value: string): Promise<{ path: string; contents: string; } | null> {
    const paths = Utils.getShellRcFiles();

    const aliasString = this.aliasString(alias, value);
    const aliasStringShort = this.aliasStringShort(alias, value);

    for (const path of paths) {
      if (await FileUtils.fileExists(path)) {
        const fileContents = await fs.readFile(path, 'utf8');

        if (fileContents.includes(aliasString) || fileContents.includes(aliasStringShort)) {
          return {
            path,
            contents: fileContents,
          }
        }
      }
    }

    return null;
  }

  private aliasString(alias: string, value: string): string {
    return `alias ${alias}='${value}'`
  }

  private aliasStringShort(alias: string, value: string): string {
    return `alias ${alias}=${value}`
  }
}
