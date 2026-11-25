import { Plan } from '@codifycli/plugin-core';
import { describe, expect, it } from 'vitest';

import { matchVersionPrefix, newestVersion, parseNodeReleaseList, VersionAlias } from './version-aliases.js';
import { GlobalVersionParameter } from './global-version-parameter.js';
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

describe('parseNodeReleaseList', () => {
  it('parses fnm list and list-remote output', () => {
    expect(parseNodeReleaseList('* v22.11.0 default, lts-latest\n* v25.2.1\n* system')).toEqual([
      { version: '22.11.0', annotations: 'default, lts-latest', isLts: false },
      { version: '25.2.1', annotations: '', isLts: false },
    ]);
    expect(parseNodeReleaseList('v22.11.0 (Jod)\nv23.0.0').map((l) => l.isLts)).toEqual([true, false]);
  });

  it('parses nvm ls-remote output', () => {
    const output = [
      '        v22.11.0   (LTS: Jod)',
      '->      v24.11.1   (Latest LTS: Krypton)',
      '        v26.13.1',
      '        v27.0.0-alpha.0.1.1',
    ].join('\n');

    const parsed = parseNodeReleaseList(output);
    expect(parsed.map((l) => l.version)).toEqual(['22.11.0', '24.11.1', '26.13.1']);
    expect(parsed.map((l) => l.isLts)).toEqual([true, true, false]);
  });

  it('skips prereleases', () => {
    expect(parseNodeReleaseList('v27.0.0-alpha.0.1.1\nv27.0.0-rc.1 (Foo)')).toEqual([]);
  });
});

class FakeGlobalParameter extends GlobalVersionParameter<FakeConfig> {
  sets: string[] = [];

  constructor(versions: FakeVersionsParameter, public current: null | string) {
    super(versions);
  }

  protected async readGlobal() { return this.current; }
  protected async setGlobal(version: string) { this.sets.push(version); this.current = version; }
  override async remove() {}
}

describe('GlobalVersionParameter', () => {
  it('converges when the global is the version the keyword resolves to', async () => {
    const versions = new FakeVersionsParameter(['24.11.1'], { latest: '25.2.1', lts: '24.11.1' });
    expect(await new FakeGlobalParameter(versions, '24.11.1').refresh('lts', {})).toBe('lts');
    expect(await new FakeGlobalParameter(versions, '24.11.1').refresh('latest', {})).toBe('24.11.1');
  });

  it('sets the concrete version, never the keyword', async () => {
    const versions = new FakeVersionsParameter(['24.11.1', '25.2.1'], { latest: '25.2.1', lts: '24.11.1' });
    const global = new FakeGlobalParameter(versions, '24.11.1');
    await global.modify('latest', 'lts', { desiredConfig: {} } as unknown as Plan<FakeConfig>);
    await global.add('22', { desiredConfig: {} } as unknown as Plan<FakeConfig>);
    expect(global.sets).toEqual(['25.2.1', '22']);
  });
});
