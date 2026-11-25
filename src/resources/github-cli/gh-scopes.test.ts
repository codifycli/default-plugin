import { describe, expect, it } from 'vitest';

import { expandScopes, missingScopes, parseTokenScopes } from './gh-scopes.js';
import { parseGithubSshKeys, publicKeyIdentity } from './github-cli-ssh-key.js';

describe('parseTokenScopes', () => {
  it('parses the current gh auth status format', () => {
    const output = [
      'github.com',
      '  ✓ Logged in to github.com account octocat (keyring)',
      '  - Active account: true',
      '  - Git operations protocol: ssh',
      '  - Token: gho_************************************',
      "  - Token scopes: 'admin:public_key', 'gist', 'read:org', 'repo'",
    ].join('\n');

    expect(parseTokenScopes(output)).toEqual(['admin:public_key', 'gist', 'read:org', 'repo']);
  });

  it('parses the legacy format without quotes', () => {
    const output = [
      'github.com',
      '  ✓ Logged in to github.com as octocat (oauth_token)',
      '  ✓ Git operations for github.com configured to use https protocol.',
      '  ✓ Token: *******************',
      '  ✓ Token scopes: gist, read:org, repo, workflow',
    ].join('\n');

    expect(parseTokenScopes(output)).toEqual(['gist', 'read:org', 'repo', 'workflow']);
  });

  it('uses the active account when several are logged in', () => {
    const output = [
      'github.com',
      '  ✓ Logged in to github.com account work-user (keyring)',
      '  - Active account: false',
      "  - Token scopes: 'gist', 'repo'",
      '',
      '  ✓ Logged in to github.com account octocat (keyring)',
      '  - Active account: true',
      "  - Token scopes: 'admin:public_key', 'repo'",
    ].join('\r\n');

    expect(parseTokenScopes(output)).toEqual(['admin:public_key', 'repo']);
  });

  it('ignores terminal colors', () => {
    const output = "  \u001B[32m✓\u001B[0m Logged in to github.com account octocat (keyring)\n  - Token scopes: \u001B[1m'repo'\u001B[0m";
    expect(parseTokenScopes(output)).toEqual(['repo']);
  });

  it('returns an empty list for tokens without scopes', () => {
    const output = '  ✓ Logged in to github.com account octocat (keyring)\n  - Token scopes: none';
    expect(parseTokenScopes(output)).toEqual([]);
  });

  it('returns null when the scopes are unknown', () => {
    // Fine-grained tokens and GITHUB_TOKEN don't report scopes
    expect(parseTokenScopes('  ✓ Logged in to github.com account octocat (GITHUB_TOKEN)\n  - Token: github_pat_***')).toBeNull();
    expect(parseTokenScopes('You are not logged into any GitHub hosts. To log in, run: gh auth login')).toBeNull();
  });
});

describe('missingScopes', () => {
  it('accounts for implied scopes', () => {
    expect(missingScopes(['admin:public_key'], ['read:public_key', 'write:public_key'])).toEqual([]);
    expect(missingScopes(['repo', 'admin:org'], ['public_repo', 'read:org'])).toEqual([]);
    expect(expandScopes(['user'])).toEqual(new Set(['user', 'read:user', 'user:email', 'user:follow']));
  });

  it('returns the scopes that are not granted', () => {
    expect(missingScopes(['gist', 'read:org', 'repo'], ['admin:public_key', 'repo'])).toEqual(['admin:public_key']);
    expect(missingScopes(['read:public_key'], ['admin:public_key'])).toEqual(['admin:public_key']);
  });
});

describe('github ssh keys', () => {
  it('parses one key per line', () => {
    const output = [
      '{"id":1,"key":"ssh-ed25519 AAAAC3Nz1","title":"Laptop","created_at":"2026-01-01T00:00:00Z"}\r',
      '{"id":2,"key":"ssh-rsa AAAAB3Nz2","title":"Old desktop"}',
      '',
    ].join('\n');

    expect(parseGithubSshKeys(output)).toEqual([
      { id: 1, key: 'ssh-ed25519 AAAAC3Nz1', title: 'Laptop', created_at: '2026-01-01T00:00:00Z' },
      { id: 2, key: 'ssh-rsa AAAAB3Nz2', title: 'Old desktop' },
    ]);
  });

  it('returns no keys for an empty account', () => {
    expect(parseGithubSshKeys('')).toEqual([]);
  });

  it('compares keys without their comment', () => {
    expect(publicKeyIdentity('ssh-ed25519 AAAAC3Nz1 me@laptop\n')).toBe('ssh-ed25519 AAAAC3Nz1');
    expect(publicKeyIdentity('ssh-ed25519 AAAAC3Nz1')).toBe('ssh-ed25519 AAAAC3Nz1');
    expect(publicKeyIdentity('')).toBeNull();
  });
});
