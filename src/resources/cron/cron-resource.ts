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
  z,
} from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const MARKER_PREFIX = '# Codify managed:';
const JOB_LINE_REGEX = /^(@\w+|(?:\S+\s+){4}\S+)\s+(.+)$/;

export const schema = z.object({
  jobs: z
    .array(z.object({
      name: z.string().describe('A unique name identifying this cron job'),
      schedule: z.string().describe('Cron schedule expression (e.g. "0 5 * * *") or a special schedule string (@reboot, @yearly, @monthly, @weekly, @daily, @hourly)'),
      command: z.string().describe('The command to run on the configured schedule'),
    }))
    .describe('Cron jobs to manage in the current user\'s crontab')
    .optional(),
  declarationsOnly: z
    .boolean()
    .optional()
    .describe('Only manage explicitly declared cron jobs found in the crontab. Defaults to true.'),
})
  .describe('Manages scheduled jobs in the current user\'s crontab.');

export type CronConfig = z.infer<typeof schema>;

interface CronJob {
  name: string;
  schedule: string;
  command: string;
}

const defaultConfig: Partial<CronConfig> = {
  jobs: [],
}

const exampleBackup: ExampleConfig = {
  title: 'Nightly backup job',
  description: 'Run a backup script every night at 2:30am.',
  configs: [{
    type: 'cron',
    jobs: [
      { name: 'nightly-backup', schedule: '30 2 * * *', command: '/usr/local/bin/backup.sh' },
    ],
  }]
}

const exampleMultiple: ExampleConfig = {
  title: 'Multiple maintenance jobs',
  description: 'Run a health check every 5 minutes and clean up a temp directory once a week.',
  configs: [{
    type: 'cron',
    jobs: [
      { name: 'health-check', schedule: '*/5 * * * *', command: 'curl -fsS https://example.com/health' },
      { name: 'weekly-cleanup', schedule: '0 3 * * 0', command: 'rm -rf /tmp/myapp-cache/*' },
    ],
  }]
}

export class CronResource extends Resource<CronConfig> {
  getSettings(): ResourceSettings<CronConfig> {
    return {
      id: 'cron',
      defaultConfig,
      exampleConfigs: {
        example1: exampleBackup,
        example2: exampleMultiple,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        jobs: {
          type: 'array',
          itemType: 'object',
          isElementEqual: (a, b) => a.name === b.name && a.schedule === b.schedule && a.command === b.command,
          filterInStatelessMode: (desired, current) =>
            current.filter((c) => desired.some((d) => d.name === c.name)),
          canModify: true,
        },
        declarationsOnly: { default: true, setting: true },
      },
      importAndDestroy: {
        refreshMapper(input) {
          if ((input.jobs?.length === 0 || !input?.jobs) && input?.jobs === undefined) {
            return { jobs: [], declarationsOnly: true };
          }

          return input;
        }
      }
    }
  }

  override async refresh(parameters: CronConfig, context: RefreshContext<CronConfig>): Promise<Partial<CronConfig> | null> {
    let jobs = await this.getManagedJobs();

    if (parameters.declarationsOnly) {
      jobs = jobs.filter((j) => parameters.jobs?.some((d) => d.name === j.name));
    }

    if (context.commandType === 'validationPlan'
      && jobs.filter((j) => context.originalDesiredConfig?.jobs?.some((d) => d.name === j.name)).length === 0
    ) {
      return null;
    }

    if (jobs.length === 0) {
      return null;
    }

    return { jobs };
  }

  override async create(plan: CreatePlan<CronConfig>): Promise<void> {
    await this.addJobs(plan.desiredConfig.jobs ?? []);
  }

  async modify(pc: ParameterChange<CronConfig>, plan: ModifyPlan<CronConfig>): Promise<void> {
    const { isStateful } = plan;

    let jobsToRemove: CronJob[];
    let jobsToAdd: CronJob[];

    if (isStateful) {
      jobsToRemove = (pc.previousValue ?? []).filter((j: CronJob) =>
        !pc.newValue?.some((n: CronJob) => n.name === j.name)
        || pc.newValue?.some((n: CronJob) => n.name === j.name && (n.schedule !== j.schedule || n.command !== j.command)));
      jobsToAdd = (pc.newValue ?? []).filter((j: CronJob) =>
        !pc.previousValue?.some((p: CronJob) => p.name === j.name)
        || pc.previousValue?.some((p: CronJob) => p.name === j.name && (p.schedule !== j.schedule || p.command !== j.command)));
    } else {
      jobsToRemove = (pc.previousValue ?? []).filter((j: CronJob) =>
        pc.newValue?.some((n: CronJob) => n.name === j.name && (n.schedule !== j.schedule || n.command !== j.command)));
      jobsToAdd = (pc.newValue ?? []).filter((j: CronJob) =>
        !pc.previousValue?.some((p: CronJob) => p.name === j.name)
        || pc.previousValue?.some((p: CronJob) => p.name === j.name && (p.schedule !== j.schedule || p.command !== j.command)));
    }

    await this.removeJobs(jobsToRemove.map((j) => j.name));
    await this.addJobs(jobsToAdd);
  }

  async destroy(plan: DestroyPlan<CronConfig>): Promise<void> {
    await this.removeJobs((plan.currentConfig.jobs ?? []).map((j) => j.name));
  }

  private async getCrontab(): Promise<string> {
    const $ = getPty();
    const { data, status } = await $.spawnSafe('crontab -l', { interactive: true });

    if (status === SpawnStatus.ERROR) {
      return '';
    }

    return data;
  }

  private async setCrontab(content: string): Promise<void> {
    const $ = getPty();
    const tmpPath = path.join(os.tmpdir(), `codify-crontab-${process.pid}-${Date.now()}.txt`);

    await fs.writeFile(tmpPath, content, 'utf8');
    try {
      await $.spawn(`crontab "${tmpPath}"`, { interactive: true });
    } finally {
      await fs.rm(tmpPath, { force: true });
    }
  }

  private async getManagedJobs(): Promise<CronJob[]> {
    const content = await this.getCrontab();
    return parseManagedJobs(content);
  }

  private async addJobs(jobsToAdd: CronJob[]): Promise<void> {
    if (jobsToAdd.length === 0) {
      return;
    }

    let content = await this.getCrontab();
    for (const job of jobsToAdd) {
      content = removeJobBlock(content, job.name);

      const block = `${MARKER_PREFIX} ${job.name}\n${job.schedule} ${job.command}\n`;
      content = content.length > 0 && !content.endsWith('\n') ? `${content}\n${block}` : `${content}${block}`;
    }

    await this.setCrontab(content);
  }

  private async removeJobs(namesToRemove: string[]): Promise<void> {
    if (namesToRemove.length === 0) {
      return;
    }

    let content = await this.getCrontab();
    for (const name of namesToRemove) {
      content = removeJobBlock(content, name);
    }

    await this.setCrontab(content);
  }
}

export function parseManagedJobs(content: string): CronJob[] {
  const lines = content.split('\n');
  const jobs: CronJob[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith(MARKER_PREFIX)) {
      continue;
    }

    const name = line.slice(MARKER_PREFIX.length).trim();
    const nextLine = (lines[i + 1] ?? '').trim();
    const match = nextLine.match(JOB_LINE_REGEX);

    if (name && match) {
      jobs.push({ name, schedule: match[1], command: match[2] });
    }
  }

  return jobs;
}

export function removeJobBlock(content: string, name: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === `${MARKER_PREFIX} ${name}`) {
      const nextLine = (lines[i + 1] ?? '').trim();
      if (JOB_LINE_REGEX.test(nextLine)) {
        i++; // Skip the schedule/command line that belongs to this marker
      }

      continue;
    }

    result.push(lines[i]);
  }

  return result.join('\n');
}
