import { CreatePlan, DestroyPlan, Resource, ResourceSettings, SpawnStatus, getPty, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { quote, readProjectFiles, wrapCommand } from '../project-install/package-managers.js';
import { exampleDeployExistingSite, exampleDeployNewSite } from './examples.js';
import {
  SCAFFOLD_TEMPLATES,
  buildDeployCommand,
  buildScaffoldCommand,
  defaultBuildCommand,
  hasWranglerConfig,
  interpretDeploymentsList,
  today,
} from './wrangler-utils.js';

export const schema = z
  .object({
    workerName: z
      .string()
      .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
      .describe('Name of the Worker. The site is served at https://<workerName>.<your-subdomain>.workers.dev. Lowercase letters, numbers and dashes, up to 63 characters, and it can\'t start or end with a dash.'),
    directory: z
      .string()
      .describe('The project directory to deploy from.'),
    framework: z
      .enum(SCAFFOLD_TEMPLATES)
      .optional()
      .describe('Scaffold a new project with create-cloudflare when the directory doesn\'t exist yet. Use "static" for plain HTML, CSS and JavaScript with no build step. Leave this out for existing projects.'),
    assets: z
      .string()
      .optional()
      .describe('Folder of static files to upload, relative to the directory (e.g. "./dist"). Only needed for plain static sites without a wrangler config.'),
    buildCommand: z
      .string()
      .optional()
      .describe('Command that builds the site before it is deployed, run in the directory. Defaults to the "build" script in package.json (run with the package manager the lockfile points to), if there is one. Set to "" to skip the build.'),
    accountId: z
      .string()
      .optional()
      .describe('Cloudflare account ID to deploy to. Only needed when your login can access more than one account.'),
  })
  .meta({ $comment: 'https://codifycli.com/docs/resources/cloudflare/cloudflare-worker' })
  .describe('Deploy a site or app to Cloudflare Workers on a free workers.dev URL. It is deployed once, when no Worker with this name exists: later changes are shipped with `wrangler deploy`. A brand-new account is asked to pick its workers.dev subdomain during the first deploy.');

export type CloudflareWorkerConfig = z.infer<typeof schema>;

const defaultConfig: Partial<CloudflareWorkerConfig> = {
  workerName: '<Replace me here!>',
  directory: '<Replace me here!>',
};

export class CloudflareWorkerResource extends Resource<CloudflareWorkerConfig> {
  getSettings(): ResourceSettings<CloudflareWorkerConfig> {
    return {
      id: 'cloudflare-worker',
      defaultConfig,
      exampleConfigs: {
        example1: exampleDeployNewSite,
        example2: exampleDeployExistingSite,
      },
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      dependencies: ['wrangler', 'wrangler-auth', 'git-repository', 'git-repositories', 'project-install', 'project-installs'],
      parameterSettings: {
        // Only the Worker on Cloudflare is tracked. The rest describes how to deploy it the first time.
        directory: { type: 'directory', setting: true },
        framework: { type: 'string', setting: true },
        assets: { type: 'string', setting: true },
        buildCommand: { type: 'string', setting: true },
        accountId: { type: 'string', setting: true },
      },
      importAndDestroy: {
        requiredParameters: ['workerName'],
      },
      allowMultiple: {
        identifyingParameters: ['workerName'],
      },
    };
  }

  async refresh(parameters: Partial<CloudflareWorkerConfig>): Promise<Partial<CloudflareWorkerConfig> | null> {
    const $ = getPty();
    const { workerName: name, directory, accountId } = parameters;
    if (!name) {
      return null;
    }

    // Run from the project so an account_id in its wrangler config is used, otherwise somewhere without a config.
    // The refresh shell ignores the env option and is shared between commands, so both go inline, in a subshell.
    const cwd = directory && await isDirectory(directory) ? directory : os.homedir();
    const accountPrefix = accountId ? `CLOUDFLARE_ACCOUNT_ID=${quote(accountId)} ` : '';
    const { data, status } = await $.spawnSafe(
      `(cd ${quote(cwd)} && ${accountPrefix}wrangler deployments list --name ${quote(name)} --json)`,
    );

    const lookup = interpretDeploymentsList(status === SpawnStatus.SUCCESS, data);
    if (lookup === 'multiple-accounts') {
      throw new Error(`cloudflare-worker "${name}": your Cloudflare login can access more than one account. Set accountId to the account to deploy to (run \`wrangler whoami\` to list them).`);
    }

    // 'unknown' is usually "not logged in yet" or "wrangler not installed yet" during the first plan. Deploying is
    // the right call then too: the deploy reports any real problem.
    return lookup === 'exists' ? { workerName: name } : null;
  }

  async create(plan: CreatePlan<CloudflareWorkerConfig>): Promise<void> {
    const { workerName: name, directory, framework, assets, buildCommand, accountId } = plan.desiredConfig;
    const $ = getPty();
    const env = accountEnv(accountId);

    if (!await isDirectory(directory)) {
      if (!framework) {
        throw new Error(`cloudflare-worker "${name}": ${directory} doesn't exist. Clone the project first (git-repository) or set framework to scaffold a new one.`);
      }

      const parent = path.dirname(directory);
      await fs.mkdir(parent, { recursive: true });
      // create-cloudflare and the framework CLIs it runs can ask questions, so the terminal is attached.
      await $.spawn(buildScaffoldCommand(path.basename(directory), framework), {
        cwd: parent,
        interactive: true,
        stdin: true,
      });
    }

    const files = await readProjectFiles(directory);
    if (!files) {
      throw new Error(`cloudflare-worker "${name}": unable to read ${directory}.`);
    }

    const build = buildCommand ?? defaultBuildCommand(files);
    if (build) {
      await $.spawn(wrapCommand(build, directory, 'npm', files), { interactive: true, env });
    }

    // Prefer the wrangler version the project pins (create-cloudflare adds one) over the global one.
    const localWrangler = path.join(directory, 'node_modules', '.bin', 'wrangler');
    const wranglerBinary = await fileExists(localWrangler) ? quote(localWrangler) : 'wrangler';

    // Attached to the terminal: on a new account wrangler asks to register the workers.dev subdomain, and it may ask
    // to confirm the config it generates for projects that don't have one.
    await $.spawn(buildDeployCommand({
      assets,
      compatibilityDate: assets && !hasWranglerConfig(files) ? today() : undefined,
      name,
      wranglerBinary,
    }), { cwd: directory, interactive: true, stdin: true, env });
  }

  async destroy(plan: DestroyPlan<CloudflareWorkerConfig>): Promise<void> {
    const $ = getPty();
    const { workerName: name, accountId } = plan.currentConfig;

    // Deletes the Worker on Cloudflare only. The local project is left alone. --force skips wrangler's own
    // confirmation (the Codify plan was already confirmed).
    await $.spawn(`wrangler delete ${quote(name)} --force`, {
      cwd: os.homedir(),
      interactive: true,
      env: accountEnv(accountId),
    });
  }
}

function accountEnv(accountId?: string): Record<string, string> | undefined {
  return accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : undefined;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
