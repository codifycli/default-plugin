import { detectPackageManagers, PACKAGE_MANAGERS, ProjectFiles, quote } from '../project-install/package-managers.js';

/** The oldest Node.js version wrangler 4 runs on (its package.json engines field). */
export const MIN_NODE_VERSION = '22.12.0';

/** Frameworks create-cloudflare can scaffold (its --framework ids). */
export const C3_FRAMEWORKS = [
  'analog',
  'angular',
  'astro',
  'docusaurus',
  'gatsby',
  'hono',
  'next',
  'nuxt',
  'qwik',
  'react',
  'react-router',
  'redwood',
  'solid',
  'svelte',
  'tanstack-start',
  'vike',
  'vue',
  'waku',
] as const;

/** `static` is not a C3 framework: it maps to the assets-only starter (plain HTML/CSS/JS, no build step). */
export const SCAFFOLD_TEMPLATES = ['static', ...C3_FRAMEWORKS] as const;
export type ScaffoldTemplate = typeof SCAFFOLD_TEMPLATES[number];

export const WRANGLER_CONFIG_FILES = ['wrangler.json', 'wrangler.jsonc', 'wrangler.toml'] as const;

export interface WhoamiAccount {
  id: string;
  name: string;
}

export interface WhoamiResult {
  accounts: WhoamiAccount[];
  authType?: string;
  email?: string;
}

/**
 * Parses `wrangler whoami --json`. Returns null when not logged in or when the output can't be read. wrangler can print
 * other lines (update notices, warnings) around the JSON, so only the outermost {...} is parsed.
 */
export function parseWhoami(output: string): WhoamiResult | null {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || (parsed as { loggedIn?: unknown }).loggedIn !== true) {
    return null;
  }

  const { accounts, authType, email } = parsed as { accounts?: unknown; authType?: unknown; email?: unknown };
  return {
    accounts: Array.isArray(accounts)
      ? accounts
        .filter((a): a is { id: unknown; name?: unknown } => Boolean(a) && typeof a === 'object' && typeof a.id === 'string')
        .map((a) => ({ id: a.id as string, name: typeof a.name === 'string' ? a.name : '' }))
      : [],
    authType: typeof authType === 'string' ? authType : undefined,
    email: typeof email === 'string' ? email : undefined,
  };
}

export type WorkerLookup = 'exists' | 'missing' | 'multiple-accounts' | 'unknown';

/**
 * Interprets the result of `wrangler deployments list --name <name> --json`.
 *
 * - exists: the Worker has at least one deployment.
 * - missing: the Cloudflare API says the Worker does not exist (error 10007).
 * - multiple-accounts: the login can see several accounts and wrangler can't pick one without a prompt.
 * - unknown: anything else (not logged in, offline, wrangler not installed).
 */
export function interpretDeploymentsList(succeeded: boolean, output: string): WorkerLookup {
  if (succeeded) {
    return 'exists';
  }

  if (/more than one account available/i.test(output)) {
    return 'multiple-accounts';
  }

  if (/\b10007\b|does not exist|script_not_found/i.test(output)) {
    return 'missing';
  }

  return 'unknown';
}

/** Compares dotted versions ("v22.12.0", "22.11"). Returns <0, 0 or >0. Non-numeric parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.trim().replace(/^v/, '').split(/[.-]/).slice(0, 3).map((p) => Number.parseInt(p, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

/** The create-cloudflare command that scaffolds `projectName` in the current directory. */
export function buildScaffoldCommand(projectName: string, template: ScaffoldTemplate): string {
  const templateFlags = template === 'static'
    ? ['--type=hello-world-assets-only']
    : [`--framework=${template}`, '--platform=workers'];

  return [
    'npm create cloudflare@latest --',
    quote(projectName),
    ...templateFlags,
    // The cloudflare-worker resource deploys after the build, with the name from the config.
    '--no-deploy',
    '--no-open',
  ].join(' ');
}

export interface DeployCommandOptions {
  assets?: string;
  /** Set when the project has no wrangler config file: wrangler then needs a compatibility date or it prompts. */
  compatibilityDate?: string;
  name: string;
  wranglerBinary: string;
}

export function buildDeployCommand({ assets, compatibilityDate, name, wranglerBinary }: DeployCommandOptions): string {
  const parts = [wranglerBinary, 'deploy', '--name', quote(name)];
  if (assets) {
    parts.push('--assets', quote(assets));
  }

  if (compatibilityDate) {
    parts.push('--compatibility-date', compatibilityDate);
  }

  return parts.join(' ');
}

/**
 * The build to run before deploying when the config doesn't set one: the project's "build" script, run with the
 * package manager its lockfile (or packageManager field) points to. Undefined when there is nothing to build.
 */
export function defaultBuildCommand(files: ProjectFiles): string | undefined {
  const scripts = files.packageJson?.scripts;
  if (!scripts || typeof scripts !== 'object' || typeof (scripts as Record<string, unknown>).build !== 'string') {
    return undefined;
  }

  const manager = detectPackageManagers(files).find((m) => PACKAGE_MANAGERS[m].ecosystem === 'node') ?? 'npm';
  return `${manager} run build`;
}

export function hasWranglerConfig(files: ProjectFiles): boolean {
  return WRANGLER_CONFIG_FILES.some((f) => files.names.has(f));
}

/** Today's date as YYYY-MM-DD, the format wrangler expects for compatibility dates. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
