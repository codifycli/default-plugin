import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { TestUtils } from '../test-utils.js';

describe('Goenv resource integration tests', () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Installs goenv, installs a Go version, and sets a global', { timeout: 600000 }, async () => {
    await PluginTester.fullTest(pluginPath, [
      {
        type: 'goenv',
        goVersions: ['1.22.0'],
        global: '1.22.0',
      },
    ], {
      validateApply: async () => {
        const goenvCheck = await testSpawn('goenv --version');
        expect(goenvCheck.status).toBe(SpawnStatus.SUCCESS);

        const { data: versions } = await testSpawn('goenv versions');
        expect(versions).toContain('1.22.0');

        const { data: globalVersion } = await testSpawn('goenv version-name');
        expect(globalVersion.trim()).toBe('1.22.0');

        const { data: goVersion, status: goStatus } = await testSpawn('go version');
        expect(goStatus).toBe(SpawnStatus.SUCCESS);
        expect(goVersion).toContain('go1.22.0');
      },
      validateDestroy: () => {
        const shellRc = TestUtils.getPrimaryShellRc();
        if (fs.existsSync(shellRc)) {
          const shellRcContents = fs.readFileSync(shellRc, 'utf-8');
          expect(shellRcContents).not.toContain('goenv init');
        }
      },
    });
  });

  it('Installs Go programs with go install and leaves other programs alone', { timeout: 600000 }, async () => {
    const goBin = async () => {
      const { data: gobin } = await testSpawn('go env GOBIN');
      if (gobin.trim()) return gobin.trim();
      const { data: gopath } = await testSpawn('go env GOPATH');
      return path.join(gopath.trim().split(path.delimiter)[0], 'bin');
    };

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'goenv',
        goVersions: ['latest'],
        global: 'latest',
        packages: ['golang.org/x/tools/cmd/stringer@latest'],
      },
    ], {
      validateApply: async () => {
        const { status } = await testSpawn('stringer -help');
        expect(status).toBe(SpawnStatus.SUCCESS);

        // Installed outside of Codify: must survive the modify below
        const { status: installStatus } = await testSpawn('go install golang.org/x/tools/cmd/goimports@latest');
        expect(installStatus).toBe(SpawnStatus.SUCCESS);
      },
      testModify: {
        modifiedConfigs: [
          {
            type: 'goenv',
            goVersions: ['latest'],
            global: 'latest',
            packages: [
              'golang.org/x/tools/cmd/stringer@latest',
              { package: 'github.com/golang-migrate/migrate/v4/cmd/migrate@latest', tags: ['postgres'] },
            ],
          },
        ],
        validateModify: async () => {
          const bin = await goBin();
          expect(fs.existsSync(path.join(bin, 'migrate'))).toBe(true);
          expect(fs.existsSync(path.join(bin, 'stringer'))).toBe(true);
          expect(fs.existsSync(path.join(bin, 'goimports'))).toBe(true);
        },
      },
    });
  });
});
