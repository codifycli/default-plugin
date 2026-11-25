import { describe, expect, it } from 'vitest';

import {
  compareVersions,
  globalVersionSchema,
  isClaimedBy,
  matchVersionPrefix,
  newestVersion,
  normalizeVersions,
  versionsArraySchema,
} from './version-aliases.js';

describe('normalizeVersions', () => {
  const installed = ['20.18.0', '22.11.0', '24.11.1', '25.2.1'];

  it('returns concrete versions when nothing is desired (import)', () => {
    expect(normalizeVersions(installed, [], {})).toEqual(installed);
  });

  it('relabels installed versions with the entries they satisfy', () => {
    const result = normalizeVersions(installed, ['20', 'lts', 'latest'], {
      '20': '20.18.0',
      lts: '24.11.1',
      latest: '25.2.1',
    });
    expect(result).toEqual(['20', '22.11.0', 'lts', 'latest']);
  });

  it('emits a version once per entry when several entries share it', () => {
    expect(normalizeVersions(['25.2.1'], ['latest', 'lts'], { latest: '25.2.1', lts: '25.2.1' }))
      .toEqual(['latest', 'lts']);
    expect(normalizeVersions(['25.2.1'], ['25.2.1', 'latest'], { '25.2.1': '25.2.1', latest: '25.2.1' }))
      .toEqual(['25.2.1', 'latest']);
  });

  it('leaves an alias out when its target is not installed (rolling upgrade pending)', () => {
    // A new release (26.0.0) is out: "latest" no longer matches what is installed, so the plan proposes an add
    expect(normalizeVersions(installed, ['latest'], { latest: null })).toEqual(installed);
  });

  it('ignores duplicate desired entries', () => {
    expect(normalizeVersions(['3.12.1'], ['3.12', '3.12'], { '3.12': '3.12.1' })).toEqual(['3.12']);
  });
});

describe('isClaimedBy', () => {
  it('detects versions still needed by other entries', () => {
    expect(isClaimedBy('25.2.1', ['25'], { '25': '25.2.1' })).toBe(true);
    expect(isClaimedBy('25.2.1', ['25.2.1'], {})).toBe(true);
    expect(isClaimedBy('25.2.1', ['lts'], { lts: '24.11.1' })).toBe(false);
    expect(isClaimedBy('25.2.1', [], {})).toBe(false);
  });
});

describe('compareVersions / newestVersion', () => {
  it('compares numerically', () => {
    expect(compareVersions('1.10.0', '1.9.3')).toBeGreaterThan(0);
    expect(compareVersions('v22.1.0', '22.1.0')).toBe(0);
    expect(compareVersions('3.12', '3.12.1')).toBeLessThan(0);
  });

  it('finds the newest version with a filter', () => {
    expect(newestVersion(['1.9.3', '1.10.0', '1.23rc1'], (v) => /^\d+(\.\d+)*$/.test(v))).toBe('1.10.0');
    expect(newestVersion([])).toBeNull();
  });
});

describe('matchVersionPrefix', () => {
  it('matches whole version segments only', () => {
    const installed = ['2.0.0', '20.1.0', '22.11.0', '22.9.0'];
    expect(matchVersionPrefix('22', installed)).toBe('22.11.0');
    expect(matchVersionPrefix('v22.9', installed)).toBe('22.9.0');
    expect(matchVersionPrefix('2', installed)).toBe('2.0.0');
    expect(matchVersionPrefix('18', installed)).toBeNull();
  });
});

describe('versionsArraySchema', () => {
  it('rejects keywords the resource does not support', () => {
    const schema = versionsArraySchema(['latest'], 'Versions.');
    expect(schema.safeParse(['latest', '3.12']).success).toBe(true);
    expect(schema.safeParse(['lts']).success).toBe(false);
  });

  it('accepts all supported keywords', () => {
    const schema = versionsArraySchema(['latest', 'lts'], 'Versions.');
    expect(schema.safeParse(['latest', 'lts', '22']).success).toBe(true);
    expect(schema.description).toContain('"lts"');
  });
});

describe('globalVersionSchema', () => {
  it('rejects keywords the resource does not support', () => {
    const schema = globalVersionSchema(['latest'], 'Global version.');
    expect(schema.safeParse('latest').success).toBe(true);
    expect(schema.safeParse('3.12').success).toBe(true);
    expect(schema.safeParse('lts').success).toBe(false);
    expect(globalVersionSchema(['latest', 'lts'], 'Global.').safeParse('lts').success).toBe(true);
  });
});
