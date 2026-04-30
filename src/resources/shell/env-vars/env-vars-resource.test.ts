import { describe, expect, it } from 'vitest';
import { EnvVarsResource } from './env-vars-resource.js';

describe('EnvVarsResource unit tests', () => {
  it('parses a simple unquoted export', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations('export FOO=bar\n');
    expect(result).toMatchObject([{ variable: 'FOO', value: 'bar' }]);
  });

  it('parses a double-quoted export', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations('export PNPM_HOME="/Users/me/Library/pnpm"\n');
    expect(result).toMatchObject([{ variable: 'PNPM_HOME', value: '/Users/me/Library/pnpm' }]);
  });

  it('parses a value containing shell variables', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations('export PYENV_ROOT="$HOME/.pyenv"\n');
    expect(result).toMatchObject([{ variable: 'PYENV_ROOT', value: '$HOME/.pyenv' }]);
  });

  it('parses multiple exports in one file', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations(`
export PNPM_HOME="/Users/me/Library/pnpm"
export BUN_INSTALL="$HOME/.bun"
export DENO_INSTALL="$HOME/.deno"
`);
    expect(result).toMatchObject([
      { variable: 'PNPM_HOME', value: '/Users/me/Library/pnpm' },
      { variable: 'BUN_INSTALL', value: '$HOME/.bun' },
      { variable: 'DENO_INSTALL', value: '$HOME/.deno' },
    ]);
  });

  it('excludes PATH declarations', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations(`
export PNPM_HOME="/Users/me/Library/pnpm"
export PATH="$PNPM_HOME:$PATH"
`);
    expect(result).toMatchObject([{ variable: 'PNPM_HOME', value: '/Users/me/Library/pnpm' }]);
    expect(result.find((r) => r.variable === 'PATH')).toBeUndefined();
  });

  it('ignores non-export assignments', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations(`
FOO=bar
MY_VAR=something
export REAL_VAR="value"
`);
    expect(result).toMatchObject([{ variable: 'REAL_VAR', value: 'value' }]);
    expect(result.length).toBe(1);
  });

  it('ignores commented-out lines', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations(`
# export COMMENTED_OUT="nope"
export ACTIVE="yes"
`);
    expect(result).toMatchObject([{ variable: 'ACTIVE', value: 'yes' }]);
    expect(result.length).toBe(1);
  });

  it('parses declaration at end of file with no trailing newline', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations('export PNPM_HOME="/Users/me/Library/pnpm"');
    expect(result).toMatchObject([{ variable: 'PNPM_HOME', value: '/Users/me/Library/pnpm' }]);
  });

  it('parses single-quoted values', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations("export MY_TOKEN='abc123'\n");
    expect(result).toMatchObject([{ variable: 'MY_TOKEN', value: 'abc123' }]);
  });

  it('handles mixed content (comments, paths, exports)', () => {
    const resource = new EnvVarsResource();
    const result = resource.findAllDeclarations(`
# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"

export PNPM_HOME="$HOME/Library/pnpm"
`);
    expect(result).toMatchObject([
      { variable: 'BUN_INSTALL', value: '$HOME/.bun' },
      { variable: 'PYENV_ROOT', value: '$HOME/.pyenv' },
      { variable: 'PNPM_HOME', value: '$HOME/Library/pnpm' },
    ]);
    expect(result.find((r) => r.variable === 'PATH')).toBeUndefined();
  });
});
