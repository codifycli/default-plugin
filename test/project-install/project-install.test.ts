import { SpawnStatus } from '@codifycli/plugin-core';
import { PluginTester, testSpawn } from '@codifycli/plugin-test';
import { ResourceOperation } from '@codifycli/schemas';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const pluginPath = path.resolve('./src/index.ts');
const projectsDir = path.join(os.homedir(), 'project-install-tests');

function writeProject(name: string, files: Record<string, string>): string {
  const dir = path.join(projectsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), content);
  }

  return dir;
}

const packageJson = (deps: Record<string, string>) => JSON.stringify({ name: 'test-project', version: '1.0.0', dependencies: deps }, null, 2);

describe('project-install integration tests', () => {
  it('Installs npm dependencies only when they are out of date', { timeout: 600000 }, async () => {
    const dir = writeProject('npm-project', { 'package.json': packageJson({ 'is-number': '7.0.0' }) });
    const configs = [
      { type: 'nvm', nodeVersions: ['22'], global: '22' },
      { type: 'project-install', directory: dir },
    ];

    await PluginTester.fullTest(pluginPath, configs, {
      skipUninstall: true,
      skipImport: true,
      validateApply: async () => {
        expect(fs.existsSync(path.join(dir, 'node_modules', 'is-number', 'package.json'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'package-lock.json'))).toBe(true);
      },
    });

    // Already installed: no changes.
    await PluginTester.fullTest(pluginPath, configs, {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans.find((p) => p.resourceType === 'project-install')).toMatchObject({ operation: ResourceOperation.NOOP });
      },
    });

    // A dependency change makes it out of date again.
    fs.writeFileSync(path.join(dir, 'package.json'), packageJson({ 'is-number': '7.0.0', 'is-odd': '3.0.1' }));
    await PluginTester.fullTest(pluginPath, configs, {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans.find((p) => p.resourceType === 'project-install')).toMatchObject({ operation: ResourceOperation.CREATE });
      },
      validateApply: async () => {
        expect(fs.existsSync(path.join(dir, 'node_modules', 'is-odd', 'package.json'))).toBe(true);
      },
    });
  });

  it('Installs pnpm dependencies with a frozen lockfile', { timeout: 600000 }, async () => {
    const dir = writeProject('pnpm-project', {
      'package.json': JSON.stringify({ name: 'pnpm-project', version: '1.0.0', dependencies: { 'is-number': '7.0.0' }, packageManager: 'pnpm@9.15.0' }, null, 2),
    });

    await PluginTester.fullTest(pluginPath, [
      { type: 'nvm', nodeVersions: ['22'], global: '22' },
      { type: 'pnpm' },
      { type: 'project-install', directory: dir },
    ], {
      skipUninstall: true,
      skipImport: true,
      validateApply: async () => {
        expect(fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))).toBe(true);
        expect(fs.existsSync(path.join(dir, 'node_modules', '.pnpm'))).toBe(true);
      },
    });

    await PluginTester.fullTest(pluginPath, [
      { type: 'project-install', directory: dir, frozenLockfile: true },
    ], {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({ operation: ResourceOperation.NOOP });
      },
    });
  });

  it('Installs pip requirements into a virtualenv', { timeout: 600000 }, async () => {
    const dir = writeProject('pip-project', { 'requirements.txt': 'six==1.16.0\n' });

    await PluginTester.fullTest(pluginPath, [
      { type: 'uv', pythonVersions: ['3.12'], global: '3.12' },
      { type: 'project-install', directory: dir },
    ], {
      skipUninstall: true,
      skipImport: true,
      validateApply: async () => {
        expect(fs.existsSync(path.join(dir, '.venv', 'pyvenv.cfg'))).toBe(true);
        const result = await testSpawn(`${path.join(dir, '.venv', 'bin', 'python')} -c "import six; print(six.__version__)"`);
        expect(result.status).toBe(SpawnStatus.SUCCESS);
        expect(result.data).toContain('1.16.0');
      },
    });

    await PluginTester.fullTest(pluginPath, [
      { type: 'project-install', directory: dir },
    ], {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({ operation: ResourceOperation.NOOP });
      },
    });
  });

  it('Runs uv sync for a uv project', { timeout: 600000 }, async () => {
    const dir = writeProject('uv-project', {
      'pyproject.toml': '[project]\nname = "uv-project"\nversion = "0.1.0"\nrequires-python = ">=3.12"\ndependencies = ["six==1.16.0"]\n\n[tool.uv]\npackage = false\n',
    });

    await PluginTester.fullTest(pluginPath, [
      { type: 'uv', pythonVersions: ['3.12'], global: '3.12' },
      { type: 'project-install', directory: dir, packageManagers: ['uv'] },
    ], {
      skipUninstall: true,
      skipImport: true,
      validateApply: async () => {
        expect(fs.existsSync(path.join(dir, 'uv.lock'))).toBe(true);
        expect(fs.existsSync(path.join(dir, '.venv'))).toBe(true);
      },
    });

    await PluginTester.fullTest(pluginPath, [
      { type: 'project-install', directory: dir },
    ], {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({ operation: ResourceOperation.NOOP });
      },
    });
  });

  it('Installs every detected package manager in a polyglot project', { timeout: 600000 }, async () => {
    const dir = writeProject('polyglot-project', {
      'package.json': packageJson({ 'is-number': '7.0.0' }),
      'requirements.txt': 'six==1.16.0\n',
    });

    await PluginTester.fullTest(pluginPath, [
      { type: 'nvm', nodeVersions: ['22'], global: '22' },
      { type: 'uv', pythonVersions: ['3.12'], global: '3.12' },
      { type: 'project-install', directory: dir },
    ], {
      skipUninstall: true,
      skipImport: true,
      validateApply: async () => {
        expect(fs.existsSync(path.join(dir, 'node_modules', 'is-number'))).toBe(true);
        expect(fs.existsSync(path.join(dir, '.venv', 'pyvenv.cfg'))).toBe(true);
      },
    });
  });
});
