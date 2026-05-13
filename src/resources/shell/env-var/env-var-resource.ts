import {
  CreatePlan,
  DestroyPlan,
  ExampleConfig,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  Utils,
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from '@codifycli/schemas';
import fs from 'node:fs/promises';

import { FileUtils } from '../../../utils/file-utils.js';
import Schema from './env-var-schema.json';

export interface EnvVarConfig extends StringIndexedObject {
  variable: string;
  value: string;
}

const ENV_DECLARATION_REGEX = /^\s*export\s+([A-Z_a-z][A-Z0-9_a-z]*)\s*=\s*(["']?)(.+?)\2\s*(?:#.*)?$/gm;

const defaultConfig: Partial<EnvVarConfig> = {
  variable: '<Replace me here!>',
  value: '<Replace me here!>',
}

const examplePnpmHome: ExampleConfig = {
  title: 'Set PNPM_HOME',
  description: 'Declare the PNPM_HOME environment variable so pnpm global binaries are available in a new shell.',
  configs: [{
    type: 'env-var',
    variable: 'PNPM_HOME',
    value: '$HOME/Library/pnpm',
  }]
}

const exampleAsdfDataDir: ExampleConfig = {
  title: 'Set ASDF_DATA_DIR',
  description: 'Override the default asdf data directory to a custom location.',
  configs: [{
    type: 'env-var',
    variable: 'ASDF_DATA_DIR',
    value: '$HOME/.asdf',
  }]
}

export class EnvVarResource extends Resource<EnvVarConfig> {
  private readonly filePaths = Utils.getShellRcFiles();

  getSettings(): ResourceSettings<EnvVarConfig> {
    return {
      id: 'env-var',
      defaultConfig,
      exampleConfigs: {
        example1: examplePnpmHome,
        example2: exampleAsdfDataDir,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        value: { canModify: true, isSensitive: true },
      },
      importAndDestroy: {
        preventImport: true,
      },
      allowMultiple: {
        identifyingParameters: ['variable'],
      },
    }
  }

  override async refresh(parameters: Partial<EnvVarConfig>): Promise<Partial<EnvVarConfig> | null> {
    for (const filePath of this.filePaths) {
      if (!(await FileUtils.fileExists(filePath))) {
        continue;
      }

      const contents = await fs.readFile(filePath, 'utf8');
      const declarations = this.findAllDeclarations(contents);
      const found = declarations.find((d) => d.variable === parameters.variable);

      if (found) {
        return found;
      }
    }

    return null;
  }

  override async create(plan: CreatePlan<EnvVarConfig>): Promise<void> {
    const shellRcPath = Utils.getPrimaryShellRc();
    if (!(await FileUtils.fileExists(shellRcPath))) {
      await fs.writeFile(shellRcPath, '', { encoding: 'utf8' });
    }

    await FileUtils.addToStartupFile(this.declarationString(plan.desiredConfig.variable, plan.desiredConfig.value));
  }

  override async modify(pc: ParameterChange<EnvVarConfig>, plan: ModifyPlan<EnvVarConfig>): Promise<void> {
    if (pc.name !== 'value') {
      return;
    }

    const { variable, value } = plan.currentConfig;
    const found = await this.findDeclaration(variable, value);
    if (!found) {
      throw new Error(`Unable to find env var declaration: ${variable}. Please remove it manually and re-run Codify.`);
    }

    const lines = found.contents.trimEnd().split(/\n/);
    const lineIndex = lines.findIndex((l) => l.trim() === this.declarationString(variable, value));
    if (lineIndex === -1) {
      throw new Error(`Unable to find line for ${variable} in ${found.path}. Please remove it manually and re-run Codify.`);
    }

    lines.splice(lineIndex, 1, this.declarationString(plan.desiredConfig.variable, plan.desiredConfig.value));
    await fs.writeFile(found.path, lines.join('\n'), 'utf8');
  }

  override async destroy(plan: DestroyPlan<EnvVarConfig>): Promise<void> {
    const { variable, value } = plan.currentConfig;
    const found = await this.findDeclaration(variable, value);
    if (!found) {
      throw new Error(`Unable to find env var declaration: ${variable}. Please remove it manually and re-run Codify.`);
    }

    await FileUtils.removeLineFromFile(found.path, this.declarationString(variable, value));
  }

  private async findDeclaration(variable: string, value: string): Promise<{ path: string; contents: string } | null> {
    const declaration = this.declarationString(variable, value);

    for (const filePath of this.filePaths) {
      if (!(await FileUtils.fileExists(filePath))) {
        continue;
      }

      const contents = await fs.readFile(filePath, 'utf8');
      if (contents.includes(declaration)) {
        return { path: filePath, contents };
      }
    }

    return null;
  }

  findAllDeclarations(contents: string): Array<{ variable: string; value: string }> {
    const results: Array<{ variable: string; value: string }> = [];
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
