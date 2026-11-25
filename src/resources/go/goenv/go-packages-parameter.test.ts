import { describe, expect, it } from 'vitest';

import { goPackagePath, goPackageVersion, isGoPackageEqual, parseGoVersionM } from './go-packages-parameter.js';

describe('go packages', () => {
  it('parses go version -m output for a bin directory', () => {
    const output = [
      '/home/me/go/bin/dlv: go1.26.1',
      '\tpath\tgithub.com/go-delve/delve/cmd/dlv',
      '\tmod\tgithub.com/go-delve/delve\tv1.25.2\th1:abc=',
      '\tdep\tgithub.com/cilium/ebpf\tv0.11.0\th1:def=',
      '\tbuild\t-buildmode=exe',
      '/home/me/go/bin/gopls: go1.26.1',
      '\tpath\tgolang.org/x/tools/gopls',
      '\tmod\tgolang.org/x/tools/gopls\tv0.20.0\th1:ghi=',
      '/home/me/go/bin/local-tool: go1.26.1',
      '\tpath\texample.com/local-tool',
      '\tmod\texample.com/local-tool\t(devel)\t',
      '/home/me/go/bin/gofmt: go1.26.1',
      '\tpath\tcmd/gofmt',
      '\tbuild\t-buildmode=exe',
    ].join('\r\n');

    expect(parseGoVersionM(output)).toEqual([
      { file: '/home/me/go/bin/dlv', path: 'github.com/go-delve/delve/cmd/dlv', version: 'v1.25.2' },
      { file: '/home/me/go/bin/gopls', path: 'golang.org/x/tools/gopls', version: 'v0.20.0' },
      { file: '/home/me/go/bin/local-tool', path: 'example.com/local-tool', version: '(devel)' },
      { file: '/home/me/go/bin/gofmt', path: 'cmd/gofmt' },
    ]);
  });

  it('handles file names with spaces and empty directories', () => {
    expect(parseGoVersionM('/Users/me/my tools/bin/air: go1.26.1\n\tpath\tgithub.com/air-verse/air\n')).toEqual([
      { file: '/Users/me/my tools/bin/air', path: 'github.com/air-verse/air' },
    ]);
    expect(parseGoVersionM('')).toEqual([]);
  });

  it('splits package paths and versions', () => {
    expect(goPackagePath('golang.org/x/tools/gopls@v0.20.0')).toBe('golang.org/x/tools/gopls');
    expect(goPackageVersion('golang.org/x/tools/gopls@v0.20.0')).toBe('v0.20.0');
    expect(goPackageVersion('golang.org/x/tools/gopls@latest')).toBeUndefined();
    expect(goPackageVersion('golang.org/x/tools/gopls')).toBeUndefined();
    expect(goPackagePath({ package: 'github.com/golang-migrate/migrate/v4/cmd/migrate@latest', tags: ['postgres'] }))
      .toBe('github.com/golang-migrate/migrate/v4/cmd/migrate');
  });

  it('treats any installed version as installed unless a version is pinned', () => {
    const installed = 'github.com/go-delve/delve/cmd/dlv@v1.25.2';

    expect(isGoPackageEqual('github.com/go-delve/delve/cmd/dlv', installed)).toBe(true);
    expect(isGoPackageEqual('github.com/go-delve/delve/cmd/dlv@latest', installed)).toBe(true);
    expect(isGoPackageEqual({ package: 'github.com/go-delve/delve/cmd/dlv@latest', tags: ['x'] }, installed)).toBe(true);
    expect(isGoPackageEqual('github.com/go-delve/delve/cmd/dlv@v1.25.2', installed)).toBe(true);
    expect(isGoPackageEqual('github.com/go-delve/delve/cmd/dlv@v1.24.0', installed)).toBe(false);
    expect(isGoPackageEqual('golang.org/x/tools/gopls@latest', installed)).toBe(false);
  });
});
