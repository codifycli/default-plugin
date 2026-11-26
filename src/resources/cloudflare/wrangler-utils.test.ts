import { describe, expect, it } from 'vitest';

import { ProjectFiles } from '../project-install/package-managers.js';
import {
  buildDeployCommand,
  buildScaffoldCommand,
  compareVersions,
  defaultBuildCommand,
  hasWranglerConfig,
  interpretDeploymentsList,
  parseWhoami,
} from './wrangler-utils.js';

function files(names: string[], packageJson?: Record<string, unknown>): ProjectFiles {
  return { names: new Set(names), packageJson };
}

describe('parseWhoami', () => {
  it('parses a logged in OAuth user', () => {
    const output = JSON.stringify({
      loggedIn: true,
      authType: 'OAuth Token',
      email: 'user@example.com',
      accounts: [{ id: 'abc123', name: 'My Account' }],
      tokenPermissions: ['workers:write'],
    });

    expect(parseWhoami(output)).toEqual({
      authType: 'OAuth Token',
      email: 'user@example.com',
      accounts: [{ id: 'abc123', name: 'My Account' }],
    });
  });

  it('ignores lines printed around the JSON', () => {
    const output = '▲ [WARNING] A newer version of wrangler is available\n{"loggedIn":true,"accounts":[]}\n';
    expect(parseWhoami(output)).toEqual({ accounts: [], authType: undefined, email: undefined });
  });

  it('returns null when logged out or unreadable', () => {
    expect(parseWhoami('{"loggedIn":false}')).toBeNull();
    expect(parseWhoami('You are not authenticated. Please run `wrangler login`.')).toBeNull();
    expect(parseWhoami('{not json}')).toBeNull();
    expect(parseWhoami('')).toBeNull();
  });

  it('drops malformed accounts', () => {
    const output = '{"loggedIn":true,"accounts":[{"id":"a","name":"A"},{"name":"no id"},null,{"id":"b"}]}';
    expect(parseWhoami(output)?.accounts).toEqual([{ id: 'a', name: 'A' }, { id: 'b', name: '' }]);
  });
});

describe('interpretDeploymentsList', () => {
  it('treats success as an existing Worker', () => {
    expect(interpretDeploymentsList(true, '[]')).toBe('exists');
  });

  it('detects a missing Worker', () => {
    expect(interpretDeploymentsList(false, '✘ [ERROR] A request to the Cloudflare API failed.\n  This Worker does not exist on your account. [code: 10007]')).toBe('missing');
    expect(interpretDeploymentsList(false, 'workers.api.error.script_not_found [code: 10007]')).toBe('missing');
  });

  it('detects the multiple accounts error', () => {
    expect(interpretDeploymentsList(false, 'More than one account available but unable to select one in non-interactive mode.')).toBe('multiple-accounts');
  });

  it('returns unknown for other failures', () => {
    expect(interpretDeploymentsList(false, 'zsh: command not found: wrangler')).toBe('unknown');
    expect(interpretDeploymentsList(false, 'You are not authenticated.')).toBe('unknown');
  });
});

describe('compareVersions', () => {
  it('compares node versions', () => {
    expect(compareVersions('v22.12.0', '22.12.0')).toBe(0);
    expect(compareVersions('v22.11.9', '22.12.0')).toBeLessThan(0);
    expect(compareVersions('v24.1.0', '22.12.0')).toBeGreaterThan(0);
    expect(compareVersions('v20.18.1', '22.12.0')).toBeLessThan(0);
    expect(compareVersions('22.12', '22.12.0')).toBe(0);
  });
});

describe('buildScaffoldCommand', () => {
  it('scaffolds a framework for Workers without deploying', () => {
    expect(buildScaffoldCommand('my-site', 'astro'))
      .toBe("npm create cloudflare@latest -- 'my-site' --framework=astro --platform=workers --no-deploy --no-open");
  });

  it('uses the assets-only starter for static sites', () => {
    expect(buildScaffoldCommand('my-site', 'static'))
      .toBe("npm create cloudflare@latest -- 'my-site' --type=hello-world-assets-only --no-deploy --no-open");
  });
});

describe('buildDeployCommand', () => {
  it('deploys with the configured name', () => {
    expect(buildDeployCommand({ name: 'my-site', wranglerBinary: 'wrangler' })).toBe("wrangler deploy --name 'my-site'");
  });

  it('adds assets and a compatibility date for config-less static sites', () => {
    expect(buildDeployCommand({ name: 'my-site', wranglerBinary: 'wrangler', assets: './public', compatibilityDate: '2026-11-26' }))
      .toBe("wrangler deploy --name 'my-site' --assets './public' --compatibility-date 2026-11-26");
  });
});

describe('defaultBuildCommand', () => {
  it('runs the build script with the lockfile\'s package manager', () => {
    const scripts = { scripts: { build: 'astro build' } };
    expect(defaultBuildCommand(files(['package.json', 'package-lock.json'], scripts))).toBe('npm run build');
    expect(defaultBuildCommand(files(['package.json', 'pnpm-lock.yaml'], scripts))).toBe('pnpm run build');
    expect(defaultBuildCommand(files(['package.json'], { ...scripts, packageManager: 'yarn@4.1.0' }))).toBe('yarn run build');
  });

  it('skips projects without a build script', () => {
    expect(defaultBuildCommand(files(['package.json'], { scripts: { deploy: 'wrangler deploy' } }))).toBeUndefined();
    expect(defaultBuildCommand(files(['index.html']))).toBeUndefined();
  });
});

describe('hasWranglerConfig', () => {
  it('finds any wrangler config format', () => {
    expect(hasWranglerConfig(files(['wrangler.jsonc']))).toBe(true);
    expect(hasWranglerConfig(files(['wrangler.toml']))).toBe(true);
    expect(hasWranglerConfig(files(['package.json']))).toBe(false);
  });
});
