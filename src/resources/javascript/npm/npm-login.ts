import {
  CreatePlan,
  DestroyPlan,
  getPty,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
} from '@codifycli/plugin-core';
import { OS, ResourceConfig } from '@codifycli/schemas';
import * as fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import schema from './npm-login-schema.json';

export interface NpmLoginConfig extends ResourceConfig {
  authToken: string;
  scope?: string; // Example: "@myorg"
  registry?: string; // Example: "https://registry.npmjs.org/"
}

export class NpmLoginResource extends Resource<NpmLoginConfig> {
  getSettings(): ResourceSettings<NpmLoginConfig> {
    return {
      id: 'npm-login',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      isSensitive: true,
      dependencies: ['npm'],
      parameterSettings: {
        authToken: { canModify: true, isSensitive: true },
        scope: { canModify: true },
        registry: { canModify: true, default: 'https://registry.npmjs.org/' }
      },
      importAndDestroy: {
        requiredParameters: [],
        defaultRefreshValues: {
          authToken: '',
        }
      },
      allowMultiple: {
        identifyingParameters: ['scope', 'registry'],
        findAllParameters: async () => {
          const npmrcPath = this.getNpmrcPath();
          if (!fsSync.existsSync(npmrcPath)) {
            return [];
          }

          const content = await fs.readFile(npmrcPath, 'utf8');
          const lines = content.split(/\n/);

          const results: Array<Partial<NpmLoginConfig>> = [];

          for (const line of lines) {
            // @scope:registry=URL
            const scopeMatch = line.match(/^\s*(@[^:]+):registry\s*=\s*(\S+)\s*$/);
            if (scopeMatch) {
              const [, scope, registry] = scopeMatch;
              results.push({ scope, registry: this.normalizeRegistry(registry) });
            }
          }

          // If no scoped entries exist, don't suggest anything by default
          return results;
        }
      }
    };
  }

  override async refresh(parameters: Partial<NpmLoginConfig>): Promise<Partial<NpmLoginConfig> | null> {
    const $ = getPty();

    // Ensure npm is available
    const { status } = await $.spawnSafe('which npm');
    if (status === 'error') {
      return null;
    }

    const npmrcPath = this.getNpmrcPath();
    if (!fsSync.existsSync(npmrcPath)) {
      return null;
    }

    const content = await fs.readFile(npmrcPath, 'utf8');

    // Determine registry to check
    let registryToCheck = parameters.registry ?? 'https://registry.npmjs.org/';

    if (parameters.scope) {
      const currentRegistry = this.getRegistryForScope(content, parameters.scope);
      if (!currentRegistry) {
        // If a scope was requested but mapping doesn't exist, resource doesn't exist
        return null;
      }

      if (parameters.registry !== undefined) {
        registryToCheck = currentRegistry;
      }
    }

    const result: Partial<NpmLoginConfig> = {};

    if (parameters.scope !== undefined) {
      result.scope = parameters.scope;
    }

    if (parameters.registry !== undefined) {
      result.registry = this.normalizeRegistry(
        parameters.scope ? this.getRegistryForScope(content, parameters.scope) ?? registryToCheck : registryToCheck
      );
    }

    result.authToken = this.getAuthToken(content, registryToCheck) ?? undefined;

    return result;
  }

  override async create(plan: CreatePlan<NpmLoginConfig>): Promise<void> {
    await this.ensureNpmAvailable();

    const { authToken, registry, scope } = plan.desiredConfig;
    const npmrcPath = this.getNpmrcPath();

    await this.ensureFile(npmrcPath);
    let content = await fs.readFile(npmrcPath, 'utf8');

    const normalizedRegistry = this.normalizeRegistry(registry ?? 'https://registry.npmjs.org/');

    // Add/update scope mapping
    if (scope) {
      content = this.setScopeRegistry(content, scope, normalizedRegistry);
    }

    // Set token for registry
    content = this.setAuthToken(content, normalizedRegistry, authToken);

    await fs.writeFile(npmrcPath, content, 'utf8');
  }

  override async modify(pc: ParameterChange<NpmLoginConfig>, plan: ModifyPlan<NpmLoginConfig>): Promise<void> {
    const npmrcPath = this.getNpmrcPath();
    await this.ensureFile(npmrcPath);

    let content = await fs.readFile(npmrcPath, 'utf8');

    const prevRegistry = this.normalizeRegistry(plan.currentConfig.registry ?? 'https://registry.npmjs.org/');
    const newRegistry = this.normalizeRegistry(plan.desiredConfig.registry ?? 'https://registry.npmjs.org/');

    switch (pc.name) {
      case 'scope': {
        // Remove previous mapping if it existed, add new mapping if provided
        if (plan.currentConfig.scope) {
          content = this.removeScopeRegistry(content, plan.currentConfig.scope);
        }

        if (plan.desiredConfig.scope) {
          content = this.setScopeRegistry(content, plan.desiredConfig.scope, newRegistry);
        }

        break;
      }

      case 'registry': {
        // Move token from prev registry to new registry
        const token = plan.desiredConfig.authToken ?? plan.currentConfig.authToken ?? '';
        content = this.removeAuthToken(content, prevRegistry);
        content = this.setAuthToken(content, newRegistry, token);

        // Update scope mapping if scope exists
        if (plan.desiredConfig.scope) {
          content = this.setScopeRegistry(content, plan.desiredConfig.scope, newRegistry);
        }

        break;
      }

      case 'authToken': {
        // Update token on current registry
        content = this.setAuthToken(content, newRegistry, pc.newValue as string);
        break;
      }

      default: {
        break;
      }
    }

    await fs.writeFile(npmrcPath, content, 'utf8');
  }

  override async destroy(plan: DestroyPlan<NpmLoginConfig>): Promise<void> {
    const npmrcPath = this.getNpmrcPath();
    if (!fsSync.existsSync(npmrcPath)) {
      return;
    }

    let content = await fs.readFile(npmrcPath, 'utf8');

    const registry = this.normalizeRegistry(plan.currentConfig.registry ?? 'https://registry.npmjs.org/');

    // Remove scope mapping if provided
    if (plan.currentConfig.scope) {
      content = this.removeScopeRegistry(content, plan.currentConfig.scope);
    }

    // Remove token for registry
    content = this.removeAuthToken(content, registry);

    await fs.writeFile(npmrcPath, content, 'utf8');
  }

  private getNpmrcPath(): string {
    return path.resolve(os.homedir(), '.npmrc');
  }

  private async ensureNpmAvailable(): Promise<void> {
    const $ = getPty();
    await $.spawn('which npm', { interactive: true });
  }

  private async ensureFile(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }

    if (!fsSync.existsSync(filePath)) {
      await fs.writeFile(filePath, '', 'utf8');
    }
  }

  private normalizeRegistry(registry: string): string {
    try {
      const url = new URL(registry);
      // Ensure trailing slash
      const normalized = `${url.protocol}//${url.host}${url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'}`;
      return normalized;
    } catch {
      // Fallback to default if invalid
      return 'https://registry.npmjs.org/';
    }
  }

  private registryHost(registry: string): string {
    try {
      const { host } = new URL(this.normalizeRegistry(registry));
      return host;
    } catch {
      return 'registry.npmjs.org';
    }
  }

  private getRegistryForScope(content: string, scope: string): string | undefined {
    const regex = new RegExp(`^\\s*${this.escapeRegExp(scope)}:registry\\s*=\\s*(\\S+)\\s*$`, 'm');
    const match = content.match(regex);
    return match ? this.normalizeRegistry(match[1]) : undefined;
  }

  private setScopeRegistry(content: string, scope: string, registry: string): string {
    const line = `${scope}:registry=${registry}`;
    const regex = new RegExp(`^\\s*${this.escapeRegExp(scope)}:registry\\s*=.*$`, 'm');
    if (regex.test(content)) {
      return content.replace(regex, line);
    }

    return this.appendLine(content, line);
  }

  private removeScopeRegistry(content: string, scope: string): string {
    const regex = new RegExp(`^\\s*${this.escapeRegExp(scope)}:registry\\s*=.*$`, 'm');
    return content.replace(regex, '').replaceAll(/\n{2,}/g, '\n').trim() + '\n';
  }

  private getAuthToken(content: string, registry: string): null | string {
    const host = this.registryHost(registry);
    const key = `//${host}/:_authToken`;

    const regex = new RegExp(`^\\s*${this.escapeRegExp(key)}\\s*=(.*)$`, 'm');
    if (regex.test(content)) {
      console.log(content.match(regex)?.[1])

      return content.match(regex)?.[1] ?? null
    }

    return null
  }

  private setAuthToken(content: string, registry: string, token: string): string {
    const host = this.registryHost(registry);
    const key = `//${host}/:_authToken`;
    const line = `${key}=${token}`;

    const regex = new RegExp(`^\\s*${this.escapeRegExp(key)}\\s*=.*$`, 'm');
    if (regex.test(content)) {
      return content.replace(regex, line);
    }

    return this.appendLine(content, line);
  }

  private removeAuthToken(content: string, registry: string): string {
    const host = this.registryHost(registry);
    const key = `//${host}/:_authToken`;
    const regex = new RegExp(`^\\s*${this.escapeRegExp(key)}\\s*=.*$`, 'm');
    return content.replace(regex, '').replaceAll(/\n{2,}/g, '\n').trim() + '\n';
  }

  private appendLine(content: string, line: string): string {
    if (!content.endsWith('\n') && content.length > 0) {
      return content + '\n' + line + '\n';
    }

    return content + line + '\n';
  }

  private escapeRegExp(s: string): string {
    return s.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&');
  }
}
