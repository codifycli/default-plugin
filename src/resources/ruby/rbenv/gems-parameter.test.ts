import { describe, expect, it } from 'vitest';

import { gemName, gemVersion, gemsToState, isGemEqual, parseGemList } from './gems-parameter.js';

describe('rbenv gems', () => {
  it('parses gem list output', () => {
    const output = [
      '',
      '*** LOCAL GEMS ***',
      '',
      'apiaryio (0.20.0)',
      'bundler (default: 2.5.22, 2.4.1)',
      'nokogiri (1.16.7 arm64-darwin, 1.15.0 arm64-darwin)',
      'rake (13.2.1)',
    ].join('\r\n');

    expect(parseGemList(output)).toEqual(new Map([
      ['apiaryio', ['0.20.0']],
      ['bundler', ['2.5.22', '2.4.1']],
      ['nokogiri', ['1.16.7', '1.15.0']],
      ['rake', ['13.2.1']],
    ]));
    expect(parseGemList('')).toEqual(new Map());
  });

  it('splits gem names and versions', () => {
    expect(gemName('apiaryio@0.20.0')).toBe('apiaryio');
    expect(gemVersion('apiaryio@0.20.0')).toBe('0.20.0');
    expect(gemName('apiaryio')).toBe('apiaryio');
    expect(gemVersion('apiaryio')).toBeUndefined();
    expect(gemVersion('apiaryio@latest')).toBeUndefined();
  });

  it('treats any installed version as installed unless a version is pinned', () => {
    expect(isGemEqual('apiaryio', 'apiaryio@0.20.0')).toBe(true);
    expect(isGemEqual('apiaryio@latest', 'apiaryio@0.20.0')).toBe(true);
    expect(isGemEqual('apiaryio@0.20.0', 'apiaryio@0.20.0')).toBe(true);
    expect(isGemEqual('apiaryio@0.19.0', 'apiaryio@0.20.0')).toBe(false);
    expect(isGemEqual('rails', 'apiaryio@0.20.0')).toBe(false);
  });

  it('reports a pinned version when it is one of several installed versions', () => {
    const installed = new Map([['bundler', ['2.5.22', '2.4.1']], ['rake', ['13.2.1']]]);

    expect(gemsToState(installed, ['bundler@2.4.1'])).toEqual(['bundler@2.4.1', 'rake@13.2.1']);
    expect(gemsToState(installed, ['bundler@9.9.9'])).toEqual(['bundler@2.5.22', 'rake@13.2.1']);
    expect(gemsToState(installed, ['bundler'])).toEqual(['bundler@2.5.22', 'rake@13.2.1']);
    expect(gemsToState(installed, null)).toEqual(['bundler@2.5.22', 'rake@13.2.1']);
  });
});
