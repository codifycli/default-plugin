import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  RefreshContext,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';

import { FileUtils } from '../../../utils/file-utils.js';
import { Utils } from '../../../utils/index.js';
import os from 'node:os';
import path from 'node:path';

const ALIAS_REGEX = /^'?([^=]+?)'?='?(.*?)'?$/

interface AliasDeclaration {
  alias: string;
  value: string;
}

export const schema = z.object({
  aliases: z
    .array(z.object({
      alias: z.string().describe('The name of the alias'),
      value: z.string().describe('The alias value'),
    }))
    .describe('Aliases to create')
    .optional(),
  declarationsOnly: z.boolean().optional().describe('Only plan and manage explicitly declared aliases found in shell startup scripts.'),
}).meta({ $comment: 'https://codifycli.com/docs/resources/shell/aliases' })
  .describe('Aliases resource. Can be used to manage multiple aliases');

export type AliasesConfig = z.infer<typeof schema>;

const defaultConfig: Partial<AliasesConfig> = {
  aliases: [],
}

const exampleGitAliases: ExampleConfig = {
  title: 'Git aliases',
  description: 'Common shortcuts for everyday Git workflows - checking status, staging, committing, pushing, and viewing history.',
  configs: [{
    type: 'aliases',
    aliases: [
      { alias: 'gs', value: 'git status' },
      { alias: 'ga', value: 'git add .' },
      { alias: 'gc', value: 'git commit -m' },
      { alias: 'gp', value: 'git push origin HEAD' },
      { alias: 'gl', value: 'git log --oneline --graph --decorate' },
    ],
  }]
}

const exampleSystemAliases: ExampleConfig = {
  title: 'System and safety shortcuts',
  description: 'Handy aliases for common system tasks and safer defaults - clearing the screen, confirming deletions, and checking disk and process usage.',
  configs: [{
    type: 'aliases',
    aliases: [
      { alias: 'c', value: 'clear' },
      { alias: 'rm', value: 'rm -i' },
      { alias: 'dfh', value: 'df -h' },
      { alias: 'psg', value: 'ps aux | grep -v grep | grep' },
    ],
  }]
}

export class AliasesResource extends Resource<AliasesConfig> {
  private readonly ALIAS_DECLARATION_REGEX = /^\s*alias\s+([A-Z_a-z][\w-]*)\s*=\s*(["']?)(.+?)\2\s*(?:#.*)?$/gm;
  readonly filePaths = Utils.getShellRcFiles()

  getSettings(): ResourceSettings<AliasesConfig> {
    return {
      id: 'aliases',
      defaultConfig,
      exampleConfigs: {
        example1: exampleGitAliases,
        example2: exampleSystemAliases,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        aliases: {
          type: 'array',
          itemType: 'object',
          isElementEqual: (a, b) => a.alias === b.alias && a.value === b.value,
          filterInStatelessMode: (desired, current) =>
            current.filter((c) => desired.some((d) => d.alias === c.alias)),
          canModify: true,
        },
        declarationsOnly: { default: true, setting: true },
      },
      importAndDestroy: {
        refreshMapper(input) {
          if ((input.aliases?.length === 0 || !input?.aliases) && input?.aliases === undefined) {
            return { aliases: [], declarationsOnly: true };
          }

          return input;
        }
      }
    }
  }

  override async refresh(parameters: AliasesConfig, context: RefreshContext<AliasesConfig>): Promise<Partial<AliasesConfig> | null> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe('alias', { interactive: true });
    if (status === SpawnStatus.ERROR) {
      return null;
    }

    let aliases = data.split(/\n/g)
      .map((l) => l.trim())
      .map((l) => l.replace(/^alias\s+/, ''))
      .map((l) => l.match(ALIAS_REGEX))
      .filter(Boolean)
      .map((m) => (m ? { alias: m[1], value: m[2] } : null))
      .filter(Boolean) as Array<{ alias: string; value: string }>;

    if (parameters.declarationsOnly) {
      const aliasDeclarations: AliasDeclaration[] = [];
      for (const file of this.filePaths) {
        if (await FileUtils.fileExists(file)) {
          aliasDeclarations.push(...this.findAllDeclarations(await fs.readFile(file, 'utf8')));
        }
      }

      aliases = aliases.filter((a) => aliasDeclarations.some((d) => d.alias === a.alias));
    }

    // If validation plan and no aliases match, return null
    if (context.commandType === 'validationPlan'
      && aliases.filter((a) =>
        context.originalDesiredConfig?.aliases?.some((d) => d.alias === a.alias)).length === 0
    ) {
      return null;
    }

    if (!aliases || aliases.length === 0) {
      return null;
    }

    return {
      aliases,
    }
  }

  override async create(plan: CreatePlan<AliasesConfig>): Promise<void> {
    const shellRcPath = Utils.getPrimaryShellRc();

    if (!(await FileUtils.fileExists(shellRcPath))) {
      await fs.writeFile(shellRcPath, '', { encoding: 'utf8' });
    }

    await this.addAliases(plan.desiredConfig.aliases ?? []);
  }

  async modify(pc: ParameterChange<AliasesConfig>, plan: ModifyPlan<AliasesConfig>): Promise<void> {
    const shellRcPath = Utils.getPrimaryShellRc();

    if (!(await FileUtils.fileExists(shellRcPath))) {
      await fs.writeFile(shellRcPath, '', { encoding: 'utf8' });
    }

    const { isStateful } = plan;
    if (isStateful) {
      const aliasesToRemove = pc.previousValue
        ?.filter((a: AliasDeclaration) => !pc.newValue?.some((c: AliasDeclaration) => c.alias === a.alias)
          || pc.newValue?.some((c: AliasDeclaration) => c.alias === a.alias && c.value !== a.value)
        );
      const aliasesToAdd = pc.newValue
        ?.filter((a: AliasDeclaration) => !pc.previousValue?.some((c: AliasDeclaration) => c.alias === a.alias));

      await this.removeAliases(aliasesToRemove);
      await this.addAliases(aliasesToAdd);
    } else {
      const aliasesToRemove = pc.previousValue
        ?.filter((a: AliasDeclaration) => pc.newValue?.some((c: AliasDeclaration) => c.alias === a.alias && c.value !== a.value));

      const aliasesToAdd = pc.newValue
        ?.filter((a: AliasDeclaration) => !pc.previousValue?.some((c: AliasDeclaration) => c.alias === a.alias)
        || pc.previousValue?.some((c: AliasDeclaration) => c.alias === a.alias && c.value !== a.value));

      await this.removeAliases(aliasesToRemove);
      await this.addAliases(aliasesToAdd);
    }
  }

  async destroy(plan: DestroyPlan<AliasesConfig>): Promise<void> {
    await this.removeAliases(plan.currentConfig.aliases ?? []);
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

  private async removeAliases(aliasesToRemove: Array<{ alias: string; value: string }>): Promise<void> {
    for (const { alias, value } of aliasesToRemove ?? []) {
      const aliasInfo = await this.findAlias(alias, value);
      if (!aliasInfo) {
        console.warn(`Unable to find alias: ${alias} on the system. Codify isn't able to search all locations on the system. Please delete the alias manually and re-run Codify.`);
        continue;
      }

      const aliasString = this.aliasString(alias, value);
      const aliasStringShort = this.aliasStringShort(alias, value);

      await FileUtils.removeLineFromFile(aliasInfo.path, aliasString);
      await FileUtils.removeLineFromFile(aliasInfo.path, aliasStringShort);
    }
  }

  private async addAliases(aliasesToAdd: Array<{ alias: string; value: string }>): Promise<void> {
    for (const { alias, value } of aliasesToAdd ?? []) {
      const aliasString = this.aliasString(alias, value);
      await FileUtils.addToStartupFile(aliasString);
    }
  }

  findAllDeclarations(contents: string): AliasDeclaration[] {
    const results = [];
    const aliasDeclarations = contents.matchAll(this.ALIAS_DECLARATION_REGEX);

    for (const declaration of aliasDeclarations) {
      const [_, alias, __, value ] = declaration;
      results.push({ alias, value });
    }

    return results;
  }
}
