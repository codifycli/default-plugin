import { Plan } from '@codifycli/plugin-core';
import { describe, expect, it } from 'vitest';

import { parseFnmList } from '../resources/javascript/fast-node-manager/node-versions-parameter.js';
import { matchVersionPrefix, newestVersion, VersionAlias } from './version-aliases.js';
import { VersionsParameter } from './versions-parameter.js';

type FakeConfig = { versions?: string[] };

/** In-memory version manager so the base class logic can be tested without spawning anything. */
class FakeVersionsParameter extends VersionsParameter<FakeConfig> {
  protected readonly supportedAliases = ['latest', 'lts'] as const;
  installs: string[] = [];
  uninstalls: string[] = [];

  constructor(public installed: string[], public remote: Record<VersionAlias, null | string>) {
    super('versions');
  }

  protected async listInstalled() { return [...this.installed]; }
  protected async matchInstalled(desired: string, installed: string[]) { return matchVersionPrefix(desired, installed); }
  protected async resolveAlias(alias: VersionAlias, installed: string[]) {
    return this.remote[alias] ?? (alias === 'latest' ? newestVersion(installed) : null);
  }
  protected async installVersion(version: string) { this.installs.push(version); this.installed.push(version); }
  protected async uninstallVersion(version: string) { this.uninstalls.push(version); }
}

function plan(desired: string[] | null, current: string[] | null = null): Plan<FakeConfig> {
  return {
    desiredConfig: desired ? { versions: desired } : null,
    currentConfig: current ? { versions: current } : null,
  } as unknown as Plan<FakeConfig>;
}

describe('VersionsParameter', () => {
  it('converges when keyword targets are installed', async () => {
    const p = new FakeVersionsParameter(['22.11.0', '24.11.1', '25.2.1'], { latest: '25.2.1', lts: '24.11.1' });
    expect(await p.refresh(['22', 'lts', 'latest'], {})).toEqual(['22', 'lts', 'latest']);
  });

  it('returns concrete versions for import', async () => {
    const p = new FakeVersionsParameter(['22.11.0', '25.2.1'], { latest: '25.2.1', lts: null });
    expect(await p.refresh(null, {})).toEqual(['22.11.0', '25.2.1']);
  });

  it('rolls forward: a new release un-matches the keyword and add installs the concrete release', async () => {
    const p = new FakeVersionsParameter(['25.2.1'], { latest: '26.0.0', lts: null });
    expect(await p.refresh(['latest'], {})).toEqual(['25.2.1']);

    await p.addItem('latest', plan(['latest']));
    expect(p.installs).toEqual(['26.0.0']);
    expect(await p.refresh(['latest'], {})).toEqual(['25.2.1', 'latest']);
  });

  it('never passes a keyword to install', async () => {
    const p = new FakeVersionsParameter([], { latest: null, lts: null });
    await expect(p.addItem('lts', plan(['lts']))).rejects.toThrow('Unable to resolve "lts"');
    expect(p.installs).toEqual([]);
  });

  it('uninstalls the concrete version a keyword points to', async () => {
    const p = new FakeVersionsParameter(['24.11.1', '25.2.1'], { latest: '25.2.1', lts: '24.11.1' });
    await p.removeItem('lts', plan(['latest'], ['lts', 'latest']));
    expect(p.uninstalls).toEqual(['24.11.1']);
  });

  it('keeps a version that another entry still needs', async () => {
    const p = new FakeVersionsParameter(['25.2.1'], { latest: '25.2.1', lts: '25.2.1' });
    await p.removeItem('latest', plan(['lts'], ['latest', 'lts']));
    await p.removeItem('25', plan(['latest'], ['25', 'latest']));
    expect(p.uninstalls).toEqual([]);
  });

  it('uninstalls everything on destroy', async () => {
    const p = new FakeVersionsParameter(['25.2.1'], { latest: '25.2.1', lts: null });
    await p.removeItem('latest', plan(null, ['latest']));
    expect(p.uninstalls).toEqual(['25.2.1']);
  });

  it('resolves keywords for sibling parameters', async () => {
    const p = new FakeVersionsParameter(['24.11.1'], { latest: '25.2.1', lts: '24.11.1' });
    expect(await p.resolveKeyword('lts', {})).toBe('24.11.1');
    expect(await p.resolveKeyword('20', {})).toBe('20');
  });
});

describe('parseFnmList', () => {
  it('parses fnm list and list-remote output', () => {
    expect(parseFnmList('* v22.11.0 default, lts-latest\n* v25.2.1\n* system')).toEqual([
      { version: '22.11.0', annotations: 'default, lts-latest', isLts: false },
      { version: '25.2.1', annotations: '', isLts: false },
    ]);
    expect(parseFnmList('v22.11.0 (Jod)\nv23.0.0').map((l) => l.isLts)).toEqual([true, false]);
  });
});
