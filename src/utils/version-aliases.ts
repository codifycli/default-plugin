import { z } from '@codifycli/plugin-core';

/**
 * Symbolic version keywords that version-manager resources (nvm, pyenv, ...) accept in their versions array
 * alongside concrete versions.
 *
 * Semantics are "rolling": every plan resolves the keyword to the newest release available right now. If that
 * release isn't installed yet, the plan proposes installing it. Previously installed releases are left in place.
 */
export const VERSION_ALIASES = ['latest', 'lts'] as const;
export type VersionAlias = typeof VERSION_ALIASES[number];

export function isVersionAlias(value: string, supported: readonly VersionAlias[] = VERSION_ALIASES): value is VersionAlias {
  return (supported as readonly string[]).includes(value);
}

/**
 * Maps each desired entry (concrete, partial or alias) to the installed concrete version that satisfies it, or null
 * when nothing installed satisfies it.
 */
export type VersionMatches = Readonly<Record<string, null | string>>;

/**
 * Re-labels installed versions with the desired entries that they satisfy so that the framework's strict equality
 * check sees them as converged.
 *
 * - Installed versions not claimed by any desired entry are returned unchanged (concrete). This is also what import
 *   (desired = []) returns.
 * - One installed version may satisfy several entries (ex: `['latest', '25.2.1']`, or `['latest', 'lts']` when the
 *   latest release is also the LTS). It is then emitted once per entry.
 */
export function normalizeVersions(installed: string[], desired: string[], matches: VersionMatches): string[] {
  const labels = installed.map(() => [] as string[]);

  for (const entry of Array.from(new Set(desired))) {
    const match = matches[entry];
    if (!match) {
      continue;
    }

    const idx = installed.indexOf(match);
    if (idx !== -1) {
      labels[idx].push(entry);
    }
  }

  return installed.flatMap((version, idx) => labels[idx].length > 0 ? labels[idx] : [version]);
}

/**
 * True if any of `entries` resolves to `version`. Used to avoid uninstalling a version that is still needed by another
 * entry (ex: removing `latest` while `25.2.1` is still listed).
 */
export function isClaimedBy(version: string, entries: string[], matches: VersionMatches): boolean {
  return entries.some((entry) => entry === version || matches[entry] === version);
}

/**
 * Compares two dotted version strings numerically segment by segment (`1.10.0` > `1.9.3`). A leading `v` is ignored.
 * Non numeric segments fall back to string comparison.
 */
export function compareVersions(a: string, b: string): number {
  const pa = stripV(a).split(/[.\-]/);
  const pb = stripV(b).split(/[.\-]/);

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const sa = pa[i];
    const sb = pb[i];
    if (sa === undefined) return -1;
    if (sb === undefined) return 1;

    const na = Number(sa);
    const nb = Number(sb);
    const diff = Number.isNaN(na) || Number.isNaN(nb) ? sa.localeCompare(sb) : na - nb;
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

/** Returns the newest version in `versions` (optionally restricted to the ones passing `filter`), or null. */
export function newestVersion(versions: string[], filter: (v: string) => boolean = () => true): null | string {
  const candidates = versions.filter(filter);
  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((newest, v) => compareVersions(v, newest) > 0 ? v : newest);
}

/** Matches plain release versions: `22`, `3.12`, `1.22.0`. Excludes prereleases and other implementations. */
export const STABLE_VERSION_REGEX = /^\d+(\.\d+)*$/;

export function isStableVersion(version: string): boolean {
  return STABLE_VERSION_REGEX.test(version);
}

/**
 * Partial version matching: `22` and `22.11` both match `22.11.0`. Returns the newest installed version that the
 * desired prefix matches.
 */
export function matchVersionPrefix(desired: string, installed: string[]): null | string {
  const prefix = stripV(desired);
  return newestVersion(installed, (v) => {
    const version = stripV(v);
    return version === prefix || version.startsWith(`${prefix}.`);
  });
}

export function stripV(version: string): string {
  return version.startsWith('v') ? version.slice(1) : version;
}

/**
 * Builds the schema for a versions array. Keywords the resource does not support are rejected at validation time.
 */
export function versionsArraySchema(supported: readonly VersionAlias[], description: string) {
  const unsupported = VERSION_ALIASES.filter((a) => !supported.includes(a));
  const keywords = supported.map((a) => `"${a}"`).join(' or ');

  return z.array(z.string())
    .refine(
      (versions) => !versions.some((v) => (unsupported as string[]).includes(v)),
      { message: `Unsupported version keyword. Supported keywords: ${keywords}` },
    )
    .describe(
      `${description} Use ${keywords} to always track the newest ${supported.includes('lts') ? 'release / LTS release' : 'release'}: `
      + 'each apply installs it if a newer one is out (older installs are kept).'
      + (unsupported.length > 0 ? ` ${unsupported.map((a) => `"${a}"`).join(', ')} is not supported.` : ''),
    );
}

/**
 * Builds the schema for a global / default version parameter that resolves keywords through its versions list.
 */
export function globalVersionSchema(supported: readonly VersionAlias[], description: string) {
  const unsupported = VERSION_ALIASES.filter((a) => !supported.includes(a));
  const keywords = supported.map((a) => `"${a}"`).join(' or ');

  return z.string()
    .refine(
      (version) => !(unsupported as string[]).includes(version),
      { message: `Unsupported version keyword. Supported keywords: ${keywords}` },
    )
    .describe(
      `${description} Use ${keywords} to follow the version that keyword resolves to in the versions list.`
      + (unsupported.length > 0 ? ` ${unsupported.map((a) => `"${a}"`).join(', ')} is not supported.` : ''),
    );
}

export interface NodeReleaseLine {
  version: string;
  /** Text after the version: aliases for `fnm list` ("default, lts-latest"), LTS codename for remote lists */
  annotations: string;
  /** Remote lists mark LTS releases with their codename in parentheses: fnm `(Jod)`, nvm `(LTS: Jod)` */
  isLts: boolean;
}

/**
 * Parses Node.js version lists printed by nvm and fnm (`nvm ls-remote`, `fnm list`, `fnm list-remote`).
 * Prereleases (v27.0.0-alpha.0) and non version lines (system, N/A) are skipped.
 */
export function parseNodeReleaseList(output: string): NodeReleaseLine[] {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/v(\d+\.\d+\.\d+)(?=\s|$)(.*)$/);
      if (!match) {
        return null;
      }

      const annotations = match[2].trim();
      return { version: match[1], annotations, isLts: /\(.+\)/.test(annotations) };
    })
    .filter((l): l is NodeReleaseLine => l !== null);
}
