import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  RefreshContext,
  Resource,
  ResourceSettings,
  Utils,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';

import { FileUtils } from '../../../utils/file-utils.js';

const ENV_DECLARATION_REGEX = /^\s*export\s+([A-Z_a-z][A-Z0-9_a-z]*)\s*=\s*(["']?)(.+?)\2\s*(?:#.*)?$/gm;

export const schema = z.object({
  vars: z
    .array(z.object({
      variable: z.string().describe('The environment variable name (e.g. PNPM_HOME)'),
      value: z.string().describe('The environment variable value'),
    }))
    .describe('Environment variables to declare')
    .optional(),
  declarationsOnly: z
    .boolean()
    .optional()
    .describe('Only manage environment variables explicitly declared in shell startup scripts. Defaults to true.'),
}).meta({ $comment: 'https://codifycli.com/docs/resources/shell/env-vars' })
  .describe('Manages multiple shell environment variables by writing export declarations to the shell startup script.');

export type EnvVarsConfig = z.infer<typeof schema>;

interface EnvDeclaration {
  variable: string;
  value: string;
}

const defaultConfig: Partial<EnvVarsConfig> = {
  vars: [],
}

const exampleNodeTools: ExampleConfig = {
  title: 'Node.js tool paths',
  description: 'Set common environment variables for Node.js-adjacent tools so their binaries are available in a fresh shell.',
  configs: [{
    type: 'env-vars',
    vars: [
      { variable: 'PNPM_HOME', value: '$HOME/Library/pnpm' },
      { variable: 'BUN_INSTALL', value: '$HOME/.bun' },
    ],
  }]
}

const examplePythonPaths: ExampleConfig = {
  title: 'Python environment variables',
  description: 'Declare pyenv and virtualenv root directories so Python version management works correctly on a new machine.',
  configs: [{
    type: 'env-vars',
    vars: [
      { variable: 'PYENV_ROOT', value: '$HOME/.pyenv' },
      { variable: 'VIRTUALENVWRAPPER_PYTHON', value: '/usr/bin/python3' },
    ],
  }]
}

export class EnvVarsResource extends Resource<EnvVarsConfig> {
  readonly filePaths = Utils.getShellRcFiles();

  getSettings(): ResourceSettings<EnvVarsConfig> {
    return {
      id: 'env-vars',
      defaultConfig,
      exampleConfigs: {
        example1: exampleNodeTools,
        example2: examplePythonPaths,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        vars: {
          type: 'array',
          itemType: 'object',
          canModify: true,
          isSensitive: true,
          isElementEqual: (a, b) => a.variable === b.variable && a.value === b.value,
          filterInStatelessMode: (desired, current) =>
            current.filter((c) => desired.some((d) => d.variable === c.variable)),
        },
        declarationsOnly: { default: true, setting: true },
      },
      importAndDestroy: {
        refreshMapper(input) {
          if (!input?.vars || input.vars.length === 0) {
            return { vars: [], declarationsOnly: true };
          }
          return input;
        }
      },
    }
  }

  override async refresh(parameters: EnvVarsConfig, context: RefreshContext<EnvVarsConfig>): Promise<Partial<EnvVarsConfig> | null> {
    const declarationMap = await this.readAllDeclarations();
    const vars = [...declarationMap.values()];

    if (context.commandType === 'validationPlan'
      && vars.filter((v) => context.originalDesiredConfig?.vars?.some((d) => d.variable === v.variable)).length === 0
    ) {
      return null;
    }

    if (!vars || vars.length === 0) {
      return null;
    }

    return { vars };
  }

  override async create(plan: CreatePlan<EnvVarsConfig>): Promise<void> {
    const shellRcPath = Utils.getPrimaryShellRc();
    if (!(await FileUtils.fileExists(shellRcPath))) {
      await fs.writeFile(shellRcPath, '', { encoding: 'utf8' });
    }

    await this.addVars(plan.desiredConfig.vars ?? []);
  }

  override async modify(pc: ParameterChange<EnvVarsConfig>, plan: ModifyPlan<EnvVarsConfig>): Promise<void> {
    if (pc.name !== 'vars') {
      return;
    }

    const shellRcPath = Utils.getPrimaryShellRc();
    if (!(await FileUtils.fileExists(shellRcPath))) {
      await fs.writeFile(shellRcPath, '', { encoding: 'utf8' });
    }

    const varsToRemove = (pc.previousValue as EnvDeclaration[])
      ?.filter((p) => pc.newValue?.some((n: EnvDeclaration) => n.variable === p.variable && n.value !== p.value)
        || !pc.newValue?.some((n: EnvDeclaration) => n.variable === p.variable));

    const varsToAdd = (pc.newValue as EnvDeclaration[])
      ?.filter((n) => !pc.previousValue?.some((p: EnvDeclaration) => p.variable === n.variable)
        || pc.previousValue?.some((p: EnvDeclaration) => p.variable === n.variable && p.value !== n.value));

    await this.removeVars(varsToRemove ?? []);
    await this.addVars(varsToAdd ?? []);
  }

  override async destroy(plan: DestroyPlan<EnvVarsConfig>): Promise<void> {
    await this.removeVars(plan.currentConfig.vars ?? []);
  }

  private async addVars(vars: EnvDeclaration[]): Promise<void> {
    for (const { variable, value } of vars) {
      await FileUtils.addToStartupFile(this.declarationString(variable, value));
    }
  }

  private async removeVars(vars: EnvDeclaration[]): Promise<void> {
    for (const { variable, value } of vars) {
      const declaration = this.declarationString(variable, value);

      for (const filePath of this.filePaths) {
        if (!(await FileUtils.fileExists(filePath))) {
          continue;
        }

        const contents = await fs.readFile(filePath, 'utf8');
        if (contents.includes(declaration)) {
          await FileUtils.removeLineFromFile(filePath, declaration);
          break;
        }
      }
    }
  }

  private async readAllDeclarations(): Promise<Map<string, EnvDeclaration>> {
    const map = new Map<string, EnvDeclaration>();

    for (const filePath of this.filePaths) {
      if (!(await FileUtils.fileExists(filePath))) {
        continue;
      }

      const contents = await fs.readFile(filePath, 'utf8');
      for (const decl of this.findAllDeclarations(contents)) {
        map.set(decl.variable, decl);
      }
    }

    return map;
  }

  findAllDeclarations(contents: string): EnvDeclaration[] {
    const results: EnvDeclaration[] = [];
    const matches = contents.matchAll(ENV_DECLARATION_REGEX);

    for (const match of matches) {
      const [, variable, , value] = match;
      if (variable === 'PATH') {
        continue;
      }
      results.push({ variable, value });
    }

    return results;
  }

  private declarationString(variable: string, value: string): string {
    return `export ${variable}="${value}"`;
  }
}
