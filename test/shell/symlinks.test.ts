import { describe, expect, it } from 'vitest';
import { PluginTester } from '@codifycli/plugin-test';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { ResourceOperation } from '@codifycli/schemas';

describe('Symlinks resource integration tests', async () => {
  const pluginPath = path.resolve('./src/index.ts');

  it('Can create multiple symlinks', { timeout: 300000 }, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-symlinks-'));
    const target1 = path.join(tempDir, 'target1.txt');
    const target2 = path.join(tempDir, 'target2.txt');
    const target3 = path.join(tempDir, 'target3.txt');
    const link1 = path.join(tempDir, 'link1.txt');
    const link2 = path.join(tempDir, 'link2.txt');
    const link3 = path.join(tempDir, 'link3.txt');

    await fs.writeFile(target1, 'one');
    await fs.writeFile(target2, 'two');
    await fs.writeFile(target3, 'three');

    await PluginTester.fullTest(pluginPath, [
      {
        type: 'symlinks',
        symlinks: [
          { path: link1, target: target1 },
          { path: link2, target: target2 },
        ],
      }
    ], {
      validateApply: async () => {
        expect(await fs.readlink(link1)).to.eq(target1);
        expect(await fs.readlink(link2)).to.eq(target2);
      },
      testModify: {
        modifiedConfigs: [{
          type: 'symlinks',
          symlinks: [
            { path: link1, target: target1 },
            { path: link3, target: target3 },
          ],
        }],
        validateModify: async (plans) => {
          expect(plans[0]).toMatchObject({
            operation: ResourceOperation.MODIFY,
          });

          expect(await fs.readlink(link1)).to.eq(target1);
          expect(await fs.readlink(link3)).to.eq(target3);

          // link2 was dropped from the declared config, not removed - Codify only manages
          // explicitly declared symlinks in stateless mode, matching aliases/paths resources.
          expect(await fs.readlink(link2)).to.eq(target2);
        }
      },
      validateDestroy: async () => {
        await expect(fs.lstat(link1)).rejects.toThrow();
        await expect(fs.lstat(link3)).rejects.toThrow();

        // Targets themselves are untouched by destroy.
        expect(await fs.readFile(target1, 'utf8')).to.eq('one');
        expect(await fs.readFile(target3, 'utf8')).to.eq('three');
      },
    });
  })
})
