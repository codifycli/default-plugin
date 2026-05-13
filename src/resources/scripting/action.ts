import { CreatePlan, DestroyPlan, ExampleConfig, getPty, Resource, ResourceSettings, SpawnStatus } from '@codifycli/plugin-core';
import { RefreshContext } from '@codifycli/plugin-core/src/resource/resource.js';
import { OS, StringIndexedObject } from '@codifycli/schemas';

import schema from './action-schema.json'

export interface ActionConfig extends StringIndexedObject {
  condition?: string;
  action: string;
  cwd?: string;
}

const defaultConfig: Partial<ActionConfig> = {
  action: '<Replace me here!>',
}

const exampleConditional: ExampleConfig = {
  title: 'Run a script only when a condition is met',
  description: 'Execute a setup command only when the target directory does not already exist, making the action idempotent.',
  configs: [{
    type: 'action',
    condition: '[ ! -d ~/.config/myapp ]',
    action: 'mkdir -p ~/.config/myapp && cp /etc/myapp/defaults.conf ~/.config/myapp/config.conf',
  }]
}

const exampleCwd: ExampleConfig = {
  title: 'Run a project setup script in a specific directory',
  description: 'Run a post-clone initialisation script from within a project directory after dependencies are installed.',
  configs: [{
    type: 'action',
    action: 'make bootstrap',
    cwd: '~/projects/myapp',
  }]
}

export class ActionResource extends Resource<ActionConfig> {

  getSettings(): ResourceSettings<ActionConfig> {
    return {
      id: 'action',
      defaultConfig,
      exampleConfigs: {
        example1: exampleConditional,
        example2: exampleCwd,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        cwd: { type: 'directory' },
      },
      importAndDestroy: {
        preventImport: true,
      },
      allowMultiple: true,
    }
  }
  
  async refresh(parameters: Partial<ActionConfig>, context: RefreshContext<ActionConfig>): Promise<Partial<ActionConfig> | Partial<ActionConfig>[] | null> {
    const $ = getPty();

    // Always run if condition doesn't exist
    if (!parameters.condition) {
      return context.commandType === 'validationPlan' ? parameters : null;
    }
    
    const { condition, action, cwd } = parameters;
    const { status } = await $.spawnSafe(condition, { cwd: cwd ?? undefined });

    return status === SpawnStatus.ERROR
      ? null
      : {
        ...(condition ? { condition } : undefined),
        ...(action ? { action } : undefined),
        ...(cwd ? { cwd } : undefined),
      };
  }
  
  async create(plan: CreatePlan<ActionConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(plan.desiredConfig.action, { cwd: plan.desiredConfig.cwd ?? undefined, interactive: true });
  }
  
  async destroy(plan: DestroyPlan<ActionConfig>): Promise<void> {}
}
