import { TestUtils } from '@codifycli/plugin-test';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll } from 'vitest';

let startupRcFile: string;

const pluginPath = path.resolve('./src/index.ts');

beforeAll(async () => {
  startupRcFile = fs.readFileSync(TestUtils.getPrimaryShellRc(), 'utf8');

  if (TestUtils.isMacOS()) {
    await TestUtils.ensureXcodeInstalledOnMacOs(pluginPath)
    await TestUtils.ensureHomebrewInstalledOnMacOs(pluginPath)
  }
}, 500_000)

afterAll(() => {
  fs.writeFileSync(TestUtils.getPrimaryShellRc(), startupRcFile);
})
