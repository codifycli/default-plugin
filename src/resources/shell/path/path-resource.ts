import {
  CreatePlan,
  DestroyPlan,
  getPty,
  ModifyPlan,
  ParameterChange,
  RefreshContext,
  resolvePathWithVariables,
  Resource,
  ResourceSettings
} from '@codifycli/plugin-core';
import { OS, StringIndexedObject } from 'codify-schemas';
import fs from 'node:fs/promises';
import path from 'node:path';

import { FileUtils } from '../../../utils/file-utils.js';
import { Utils } from '../../../utils/index.js';
import { untildify } from '../../../utils/untildify.js';
import Schema from './path-schema.json';

export interface PathConfig extends StringIndexedObject {
  path: string;
  paths: string[];
  prepend: boolean;
  declarationsOnly: boolean;
}

export class PathResource extends Resource<PathConfig> {
  private readonly PATH_DECLARATION_REGEX = /((export PATH=)|(path+=\()|(path=\())(.+?)[\n;]/g;
  private readonly PATH_REGEX = /(?<=[="':(])([^"'\n\r]+?)(?=["':)\n;])/g
  private readonly filePaths = Utils.getShellRcFiles()

  getSettings(): ResourceSettings<PathConfig> {
    return {
      id: 'path',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: Schema,
      parameterSettings: {
        path: { type: 'directory' },
        paths: { canModify: true, type: 'array', itemType: 'directory' },
        prepend: { default: false, setting: true },
        declarationsOnly: { default: false, setting: true },
      },
      importAndDestroy:{
        refreshMapper: (input) => {
          if ((input.paths?.length === 0 || !input?.paths) && input?.path === undefined) {
            return { paths: [], declarationsOnly: true };
          }

          return input;
        }
      },
      allowMultiple: {
        matcher(desired, current) {
          if (desired.path) {
            return desired.path === current.path;
          }

          const currentPaths = new Set(current.paths)
          return desired.paths?.some((p) => currentPaths.has(p)) ?? false;
        },
        async findAllParameters() {
          return [{
            paths: []
          }]
        }
      }
    }
  }

  override async validate(parameters: Partial<PathConfig>): Promise<void> {
    if (parameters.path && parameters.paths) {
      throw new Error('Both path and paths cannot be specified together')
    }
  }

  override async refresh(parameters: Partial<PathConfig>, context: RefreshContext<PathConfig>): Promise<Partial<PathConfig> | null> {
    // If declarations only, we only look into files to find potential paths
    if (parameters.declarationsOnly || context.isStateful) {
      const pathsResult = new Set<string>();

      for (const path of this.filePaths) {
        if (!(await FileUtils.fileExists(path))) {
          continue;
        }

        const contents = await fs.readFile(path, 'utf8');
        const pathDeclarations = this.findAllPathDeclarations(contents);

        if (parameters.path && pathDeclarations.some((d) => resolvePathWithVariables(untildify(d.path)) === parameters.path)) {
          return parameters;
        }

        if (parameters.paths) {
          pathDeclarations
            .map((d) => d.path)
            .forEach((d) => pathsResult.add(resolvePathWithVariables(untildify(d))));
        }
      }

      if (parameters.path || pathsResult.size === 0) {
        return null;
      }

      return {
        ...parameters,
        paths: [...pathsResult],
      }
    }

    // Otherwise look in path variable to see if it exists
    const $ = getPty();
    const { data: existingPaths } = await $.spawnSafe('echo $PATH')

    if (parameters.path !== undefined && (
      existingPaths.includes(parameters.path)
    )) {
      return parameters;
    }

    // MacOS defines system paths in /etc/paths and inside the /etc/paths.d folders
    // Linux doesn't have this structure, so we skip it on Linux
    const systemPaths: string[] = [];
    if (Utils.isMacOS()) {
      try {
        systemPaths.push(...(await fs.readFile('/etc/paths', 'utf8'))
          .split(/\n/)
          .filter(Boolean));

        const pathsDir = '/etc/paths.d';
        if (await FileUtils.dirExists(pathsDir)) {
          for (const pathFile of await fs.readdir(pathsDir)) {
            systemPaths.push(...(await fs.readFile(path.join(pathsDir, pathFile), 'utf8'))
              .split(/\n/)
              .filter(Boolean)
            );
          }
        }
      } catch {
        // Ignore errors if /etc/paths doesn't exist
      }
    }

    const userPaths = existingPaths.split(':')
      .filter((p) => !systemPaths.includes(p))

    if (parameters.paths && userPaths.length > 0) {
      return { ...parameters, paths: userPaths };
    }

    return null;
  }

  override async create(plan: CreatePlan<PathConfig>): Promise<void> {
    const { path, paths, prepend } = plan.desiredConfig;

    if (path) {
      return this.addPath(path, prepend);
    }

    if (paths) {
      for (const path of paths) {
        await this.addPath(path, prepend);
      }

    }
  }

  override async modify(pc: ParameterChange<PathConfig>, plan: ModifyPlan<PathConfig>): Promise<void> {
    if (pc.name !== 'paths') {
      return;
    }
    
    const pathsToAdd = pc.newValue.filter((p: string) => !pc.previousValue.includes(p));
    const pathsToRemove = pc.previousValue.filter((p: string) => !pc.newValue.includes(p));

    for (const path of pathsToAdd) {
      await this.addPath(path, plan.desiredConfig.prepend)
    }
      
    for (const value of pathsToRemove) {
      await this.removePath(value);
    }
  }

  async destroy(plan: DestroyPlan<PathConfig>): Promise<void> {
    if (plan.currentConfig.path) {
      return this.removePath(plan.currentConfig.path);
    }

    if (plan.currentConfig.paths) {
      const { paths } = plan.currentConfig;
      for (const value of paths) {
        await this.removePath(value);
      }
    }
  }

  private async addPath(path: string, prepend = false): Promise<void> {
    // Escaping is done within file utils
    await FileUtils.addPathToPrimaryShellRc(path, prepend);
  }
  
  private async removePath(pathValue: string): Promise<void> {
    const foundPaths = await this.findPath(pathValue);
    if (foundPaths.length === 0) {
      throw new Error(`Could not find path declaration: ${pathValue}. Please manually remove the path and then re-run Codify`);
    }

    for (const foundPath of foundPaths) {
      console.log(`Removing path: ${pathValue} from ${foundPath.file}`)
      await FileUtils.removeFromFile(foundPath.file, foundPath.pathDeclaration.declaration);
    }
  }

  private async findPath(pathToFind: string): Promise<Array<{ file: string; pathDeclaration: PathDeclaration }>> {
    const result = [];

    for (const filePath of this.filePaths) {
      if (!(await FileUtils.fileExists(filePath))) {
        continue;
      }

      const contents = await fs.readFile(filePath, 'utf8');
      const pathDeclarations = this.findAllPathDeclarations(contents);

      const foundDeclarations = pathDeclarations.filter((d) => d.path === pathToFind);
      result.push(...foundDeclarations.map((d) => ({ pathDeclaration: d, file: filePath })));
    }

    return result;
  }

  findAllPathDeclarations(contents: string): PathDeclaration[] {
    const results = [];
    const pathDeclarations = contents.matchAll(this.PATH_DECLARATION_REGEX);

    for (const declaration of pathDeclarations) {
      const trimmedDeclaration = declaration[0];
      const paths = trimmedDeclaration.matchAll(this.PATH_REGEX);

      for (const path of paths) {
        const trimmedPath = path[0];
        if (trimmedPath === '$PATH') {
          continue;
        }

        results.push({
          declaration: trimmedDeclaration.trim(),
          path: trimmedPath,
        });
      }
    }

    return results;
  }

  private async resolvePathWithVariables(pathWithVariables: string): Promise<string> {
    const $ = getPty();
    const { data } = await $.spawnSafe(`echo ${pathWithVariables}`);
    return data.trim();
  }
}

interface PathDeclaration {
  // The entire declaration. Ex for: export PATH="$PYENV_ROOT/bin:$PATH", it's export PATH="$PYENV_ROOT/bin:$PATH"
  declaration: string;
  // The path being added. Ex for: export PATH="$PYENV_ROOT/bin:$PATH", it's $PYENV_ROOT/bin
  path: string;
}
