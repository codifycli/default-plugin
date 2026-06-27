import {
  CreatePlan,
  DestroyPlan,
  ModifyPlan,
  ParameterChange,
  Resource,
  ResourceSettings,
  SpawnStatus,
  getPty,
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';

import { exampleGithubCliAliasBasic, exampleGithubCliAliasShell } from './examples.js';

export const schema = z
  .object({
    alias: z
      .string()
      .describe('The alias name used to invoke the expansion'),
    expansion: z
      .string()
      .describe('The gh command or shell command this alias expands to'),
    shell: z
      .boolean()
      .optional()
      .describe(
        'When true, the expansion is treated as a shell command and passed through sh. Allows pipes, redirects, and other shell features'
      ),
  })
  .meta({ $comment: 'https://cli.github.com/manual/gh_alias_set' })
  .describe('GitHub CLI alias — create short-hand names for gh commands');

export type GithubCliAliasConfig = z.infer<typeof schema>;

const defaultConfig: Partial<GithubCliAliasConfig> = {
  shell: false,
};

export class GithubCliAliasResource extends Resource<GithubCliAliasConfig> {
  getSettings(): ResourceSettings<GithubCliAliasConfig> {
    return {
      id: 'github-cli-alias',
      defaultConfig,
      exampleConfigs: {
        example1: exampleGithubCliAliasBasic,
        example2: exampleGithubCliAliasShell,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['github-cli'],
      parameterSettings: {
        alias: {},
        expansion: { canModify: true },
        shell: { canModify: true },
      },
      allowMultiple: {
        identifyingParameters: ['alias'],
        findAllParameters: async () => {
          const $ = getPty();
          const { data, status } = await $.spawnSafe('gh alias list');
          if (status === SpawnStatus.ERROR || !data.trim()) return [];

          return data
            .split('\n')
            .filter(Boolean)
            .map((line) => {
              // gh alias list outputs "alias: expansion" (colon-space separated)
              const colonIdx = line.indexOf(':');
              const alias = (colonIdx !== -1 ? line.slice(0, colonIdx) : line).trim();
              return { alias };
            })
            .filter((a) => Boolean(a.alias));
        },
      },
    };
  }

  async refresh(params: Partial<GithubCliAliasConfig>): Promise<Partial<GithubCliAliasConfig> | null> {
    const $ = getPty();

    const { data, status } = await $.spawnSafe('gh alias list');
    if (status === SpawnStatus.ERROR || !data.trim()) return null;

    const found = this.parseAliasList(data).find((a) => a.alias === params.alias);
    if (!found) return null;

    return {
      alias: found.alias,
      expansion: found.expansion,
      shell: found.shell,
    };
  }

  async create(plan: CreatePlan<GithubCliAliasConfig>): Promise<void> {
    const $ = getPty();
    const { alias, expansion, shell } = plan.desiredConfig;
    const shellFlag = shell ? ' --shell' : '';
    await $.spawn(`gh alias set ${alias} '${expansion.replace(/'/g, "'\\''")}'${shellFlag}`);
  }

  async modify(pc: ParameterChange<GithubCliAliasConfig>, plan: ModifyPlan<GithubCliAliasConfig>): Promise<void> {
    if (pc.name === 'expansion' || pc.name === 'shell') {
      const $ = getPty();
      const { alias, expansion, shell } = plan.desiredConfig;
      const shellFlag = shell ? ' --shell' : '';
      await $.spawn(
        `gh alias set --clobber ${alias} '${expansion.replace(/'/g, "'\\''")}'${shellFlag}`
      );
    }
  }

  async destroy(plan: DestroyPlan<GithubCliAliasConfig>): Promise<void> {
    const $ = getPty();
    await $.spawn(`gh alias delete ${plan.currentConfig.alias}`);
  }

  private parseAliasList(output: string): Array<{ alias: string; expansion: string; shell: boolean }> {
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        // gh alias list outputs "alias: expansion" (colon-space separated)
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) return null;

        const alias = line.slice(0, colonIdx).trim();
        const rawExpansion = line.slice(colonIdx + 1).trim();
        const isShell = rawExpansion.startsWith('!');

        return {
          alias,
          expansion: isShell ? rawExpansion.slice(1) : rawExpansion,
          shell: isShell,
        };
      })
      .filter((x): x is { alias: string; expansion: string; shell: boolean } => x !== null);
  }
}
