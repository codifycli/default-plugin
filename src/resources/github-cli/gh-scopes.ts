import { SpawnStatus, getPty } from '@codifycli/plugin-core';

/**
 * OAuth scopes that include other scopes. Having the key grants every scope in the value.
 * https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
 */
const IMPLIED_SCOPES: Record<string, string[]> = {
  repo: ['repo:status', 'repo_deployment', 'public_repo', 'repo:invite', 'security_events'],
  'admin:org': ['write:org', 'read:org', 'manage_runners:org'],
  'write:org': ['read:org'],
  'admin:public_key': ['write:public_key', 'read:public_key'],
  'write:public_key': ['read:public_key'],
  'admin:repo_hook': ['write:repo_hook', 'read:repo_hook'],
  'write:repo_hook': ['read:repo_hook'],
  'admin:gpg_key': ['write:gpg_key', 'read:gpg_key'],
  'write:gpg_key': ['read:gpg_key'],
  'admin:ssh_signing_key': ['write:ssh_signing_key', 'read:ssh_signing_key'],
  'write:ssh_signing_key': ['read:ssh_signing_key'],
  'admin:enterprise': ['manage_runners:enterprise', 'manage_billing:enterprise', 'read:enterprise'],
  user: ['read:user', 'user:email', 'user:follow'],
  project: ['read:project'],
  'write:packages': ['read:packages'],
  workflow: [],
};

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[[\d;?]*[A-Za-z]/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

/**
 * Reads the token scopes of the active account from `gh auth status` output.
 *
 * Returns null when the scopes can't be determined (not logged in, fine-grained token, GITHUB_TOKEN env var...),
 * an empty array when the token has no scopes.
 */
export function parseTokenScopes(statusOutput: string): string[] | null {
  const lines = stripAnsi(statusOutput).split(/\r?\n/);

  // gh lists one block per account, starting with "Logged in to <host> account <user>". Prefer the active account.
  const blocks: string[][] = [];
  for (const line of lines) {
    if (/Logged in to /.test(line) || blocks.length === 0) {
      blocks.push([]);
    }

    blocks.at(-1)!.push(line);
  }

  const accountBlocks = blocks.filter((block) => block.some((line) => /Logged in to /.test(line)));
  const active = accountBlocks.find((block) => block.some((line) => /Active account:\s*true/i.test(line)))
    ?? accountBlocks[0];
  if (!active) {
    return null;
  }

  const scopesLine = active.find((line) => /Token scopes:/i.test(line));
  if (!scopesLine) {
    return null;
  }

  const value = scopesLine.slice(scopesLine.search(/Token scopes:/i) + 'Token scopes:'.length).trim();
  if (!value || value.toLowerCase() === 'none') {
    return [];
  }

  return value
    .split(',')
    .map((scope) => scope.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** The scopes granted by `scopes`, including the ones they imply. */
export function expandScopes(scopes: string[]): Set<string> {
  const result = new Set<string>();
  const queue = [...scopes];

  while (queue.length > 0) {
    const scope = queue.pop()!;
    if (result.has(scope)) continue;

    result.add(scope);
    queue.push(...(IMPLIED_SCOPES[scope] ?? []));
  }

  return result;
}

/** The scopes in `required` that `current` doesn't grant. */
export function missingScopes(current: string[], required: string[]): string[] {
  const granted = expandScopes(current);
  return required.filter((scope) => !granted.has(scope));
}

/** The token scopes of the active account on `hostname`, or null if they can't be determined. */
export async function getTokenScopes(hostname: string): Promise<string[] | null> {
  const $ = getPty();
  const { data, status } = await $.spawnSafe(`gh auth status --hostname "${hostname}"`, { interactive: true });
  if (status === SpawnStatus.ERROR) {
    return null;
  }

  return parseTokenScopes(data);
}

/**
 * Makes sure the token of the active account on `hostname` has `required` scopes. Missing scopes are added with
 * `gh auth refresh`, which opens the browser for the user to approve them.
 *
 * Does nothing when the scopes can't be determined (ex: fine-grained tokens): the gh command that needs them will
 * report the problem.
 */
export async function ensureTokenScopes(hostname: string, required: string[]): Promise<void> {
  const current = await getTokenScopes(hostname);
  if (current === null) {
    return;
  }

  const missing = missingScopes(current, required);
  if (missing.length === 0) {
    return;
  }

  const $ = getPty();
  await $.spawn(
    `gh auth refresh --hostname "${hostname}" --scopes "${missing.join(',')}"`,
    { interactive: true, stdin: true },
  );
}
