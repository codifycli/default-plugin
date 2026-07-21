import { describe, expect, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { ResourceOperation } from '@codifycli/schemas';

describe('Symlink resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can create a symlink pointing at a file', { timeout: 300000 }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-symlink-'));
    const target = path.join(tempDir, 'target.txt');
    const target2 = path.join(tempDir, 'target2.txt');
    const linkPath = path.join(tempDir, 'link.txt');

    await fs.writeFile(target, 'hello world');
    await fs.writeFile(target2, 'goodbye world');

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'symlink',
        path: linkPath,
        target,
      }
    ], {
      validateApply: async () => {
        const stats = await fs.lstat(linkPath);
        expect(stats.isSymbolicLink()).to.be.true;
        expect(await fs.readlink(linkPath)).to.eq(target);
        expect(await fs.readFile(linkPath, 'utf8')).to.eq('hello world');
      },
      testModify: {
        modifiedConfigs: [{
          type: 'symlink',
          path: linkPath,
          target: target2,
        }],
        validateModify: async (plans) => {
          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
          });

          expect(await fs.readlink(linkPath)).to.eq(target2);
          expect(await fs.readFile(linkPath, 'utf8')).to.eq('goodbye world');
        }
      },
      skipImport: true,
      validateDestroy: async () => {
        await expect(fs.lstat(linkPath)).rejects.toThrow();
        // The target file itself must not be removed, only the link.
        expect(await fs.readFile(target2, 'utf8')).to.eq('goodbye world');
      },
    });
  })

  it('Can create a symlink pointing at a directory', { timeout: 300000 }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-symlink-'));
    const targetDir = path.join(tempDir, 'target-dir');
    const linkPath = path.join(tempDir, 'nested', 'link-dir');

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, 'file.txt'), 'contents');

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'symlink',
        path: linkPath,
        target: targetDir,
      }
    ], {
      validateApply: async () => {
        const stats = await fs.lstat(linkPath);
        expect(stats.isSymbolicLink()).to.be.true;
        expect(await fs.readFile(path.join(linkPath, 'file.txt'), 'utf8')).to.eq('contents');
      },
      skipImport: true,
      validateDestroy: async () => {
        await expect(fs.lstat(linkPath)).rejects.toThrow();
        expect(await fs.readFile(path.join(targetDir, 'file.txt'), 'utf8')).to.eq('contents');
      },
    });
  })
})
