import { PluginTester } from '@codifycli/plugin-test';
import { ResourceOperation } from '@codifycli/schemas';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const pluginPath = path.resolve('./src/index.ts');
const projectsDir = path.join(os.homedir(), 'project-installs-tests');

function writeProject(name: string, files: Record<string, string>): string {
  const dir = path.join(projectsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), content);
  }

  return dir;
}

const npmProject = (name: string) => writeProject(name, {
  'package.json': JSON.stringify({ name, version: '1.0.0', dependencies: { 'is-number': '7.0.0' } }, null, 2),
});

describe('project-installs integration tests', () => {
  it('Installs multiple projects and only installs newly added ones', { timeout: 600000 }, async () => {
    const web = npmProject('web');
    const api = npmProject('api');
    const ml = writeProject('ml', { 'requirements.txt': 'six==1.16.0\n' });

    await PluginTester.fullTest(pluginPath, [
      { type: 'nvm', nodeVersions: ['22'], global: '22' },
      { type: 'uv', pythonVersions: ['3.12'], global: '3.12' },
      { type: 'project-installs', directories: [web, ml] },
    ], {
      skipUninstall: true,
      skipImport: true,
      validateApply: async () => {
        expect(fs.existsSync(path.join(web, 'node_modules', 'is-number'))).toBe(true);
        expect(fs.existsSync(path.join(ml, '.venv', 'pyvenv.cfg'))).toBe(true);
      },
    });

    // Nothing changed: no-op.
    await PluginTester.fullTest(pluginPath, [
      { type: 'project-installs', directories: [web, ml] },
    ], {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({ operation: ResourceOperation.NOOP });
      },
    });

    // Adding a directory only installs that directory.
    await PluginTester.fullTest(pluginPath, [
      { type: 'project-installs', directories: [web, ml, api] },
    ], {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({ operation: ResourceOperation.MODIFY });
      },
      validateApply: async () => {
        expect(fs.existsSync(path.join(api, 'node_modules', 'is-number'))).toBe(true);
      },
    });
  });

  it('Reinstalls a project whose dependencies were deleted', { timeout: 600000 }, async () => {
    const web = npmProject('web-reinstall');
    const api = npmProject('api-reinstall');

    await PluginTester.fullTest(pluginPath, [
      { type: 'nvm', nodeVersions: ['22'], global: '22' },
      { type: 'project-installs', directories: [web, api] },
    ], { skipUninstall: true, skipImport: true });

    fs.rmSync(path.join(api, 'node_modules'), { recursive: true, force: true });

    await PluginTester.fullTest(pluginPath, [
      { type: 'project-installs', directories: [web, api] },
    ], {
      skipUninstall: true,
      skipImport: true,
      validatePlan: (plans) => {
        expect(plans[0]).toMatchObject({ operation: ResourceOperation.MODIFY });
      },
      validateApply: async () => {
        expect(fs.existsSync(path.join(api, 'node_modules', 'is-number'))).toBe(true);
      },
    });
  });
});
