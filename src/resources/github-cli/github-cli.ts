import {
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  Utils,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { exampleGithubCliBasic, exampleGithubCliFull } from './examples.js';

export const schema = z
  .object({
    gitProtocol: z
      .enum(['https', 'ssh'])
      .optional()
      .describe('Default protocol for git operations (default: https)'),
    editor: z
      .string()
      .optional()
      .describe('Default text editor for gh commands'),
    prompt: z
      .enum(['enabled', 'disabled'])
      .optional()
      .describe('Whether interactive prompts are enabled (default: enabled)'),
    pager: z
      .string()
      .optional()
      .describe('Default pager program for gh output'),
    browser: z
      .string()
      .optional()
      .describe('Default web browser for opening URLs'),
  })
  .meta({ $comment: 'https://cli.github.com/manual/' })
  .describe('GitHub CLI (gh) — installs gh and manages global configuration');

export type GithubCliConfig = z.infer<typeof schema>;

const CONFIG_KEY_MAP: Record<keyof GithubCliConfig, string> = {
  gitProtocol: 'git_protocol',
  editor: 'editor',
  prompt: 'prompt',
  pager: 'pager',
  browser: 'browser',
};

const defaultConfig: Partial<GithubCliConfig> = {
  gitProtocol: 'https',
  prompt: 'enabled',
};

export class GithubCliResource extends Resource<GithubCliConfig> {
  getSettings(): ResourceSettings<GithubCliConfig> {
    return {
      id: 'github-cli',
      defaultConfig,
      exampleConfigs: {
        example1: exampleGithubCliBasic,
        example2: exampleGithubCliFull,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        gitProtocol: { canModify: true },
        editor: { canModify: true },
        prompt: { canModify: true },
        pager: { canModify: true },
        browser: { canModify: true },
      },
    };
  }

  async refresh(_params: Partial<GithubCliConfig>): Promise<Partial<GithubCliConfig> | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which gh');
    if (status === SpawnStatus.ERROR) return null;

    const { data, status: configStatus } = await $.spawnSafe('gh config list');
    if (configStatus === SpawnStatus.ERROR) return {};

    const configMap: Record<string, string> = {};
    for (const line of data.split('\n').filter(Boolean)) {
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      const value = line.slice(eqIdx + 1).trim();
      configMap[key] = value;
    }

    const result: Partial<GithubCliConfig> = {};

    if (configMap['git_protocol']) {
      result.gitProtocol = configMap['git_protocol'] as 'https' | 'ssh';
    }
    if (configMap['editor']) {
      result.editor = configMap['editor'];
    }
    if (configMap['prompt']) {
      result.prompt = configMap['prompt'] as 'enabled' | 'disabled';
    }
    if (configMap['pager']) {
      result.pager = configMap['pager'];
    }
    if (configMap['browser']) {
      result.browser = configMap['browser'];
    }

    return result;
  }

  async create(plan: CreatePlan<GithubCliConfig>): Promise<void> {
    await Utils.installViaPkgMgr('gh');
    await this.applyConfig(plan.desiredConfig);
  }

  async modify(pc: ParameterChange<GithubCliConfig>, _plan: ModifyPlan<GithubCliConfig>): Promise<void> {
    const $ = getPty();
    const ghKey = CONFIG_KEY_MAP[pc.name as keyof GithubCliConfig];
    if (ghKey !== undefined && pc.newValue !== undefined) {
      await $.spawn(`gh config set ${ghKey} ${pc.newValue}`);
    }
  }

  async destroy(_plan: DestroyPlan<GithubCliConfig>): Promise<void> {
    await Utils.uninstallViaPkgMgr('gh');
  }

  private async applyConfig(config: Partial<GithubCliConfig>): Promise<void> {
    const $ = getPty();
    for (const [key, ghKey] of Object.entries(CONFIG_KEY_MAP) as Array<[keyof GithubCliConfig, string]>) {
      const value = config[key];
      if (value !== undefined) {
        await $.spawn(`gh config set ${ghKey} ${value}`);
      }
    }
  }
}
