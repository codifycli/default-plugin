import { CreatePlan, FileUtils, Resource, ResourceSettings, SpawnStatus, getPty, z } from '@codifycli/plugin-core';
import { OS } from '@codifycli/schemas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Utils } from '../../utils/index.js';
import { AsdfPluginsParameter } from './plugins-parameter.js';

const schema = z.object({
  plugins: z
    .array(z.string())
    .describe(
      'Asdf plugins to install. See: https://github.com/asdf-community for a full list'
    )
    .optional()
}).meta({ $comment: 'https://codifycli.com/docs/resources/asdf/asdf' })
  .describe('Asdf resource for installing asdf, a tool version manager');

export type AsdfConfig = z.infer<typeof schema>

export class AsdfResource extends Resource<AsdfConfig> {
  getSettings(): ResourceSettings<AsdfConfig> {
    return {
      id: 'asdf',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema,
      parameterSettings: {
        plugins: { type: 'stateful', definition: new AsdfPluginsParameter() },
      }
    }
  }

  async refresh(parameters: Partial<AsdfConfig>): Promise<Partial<AsdfConfig> | Partial<AsdfConfig>[] | null> {
    const $ = getPty();

    const { status } = await $.spawnSafe('which asdf');
    return status === SpawnStatus.SUCCESS ? {} : null;
  }

  async create(plan: CreatePlan<AsdfConfig>): Promise<void> {
    const $ = getPty();

    if (Utils.isMacOS()) {
      if (!(await Utils.isHomebrewInstalled())) {
        throw new Error('Homebrew is not installed. Please install Homebrew before installing asdf.');
      }

      await $.spawn('brew install asdf', { interactive: true, env: { HOMEBREW_NO_AUTO_UPDATE: 1 } });
    }

    if (Utils.isLinux()) {
      const { data: latestVersion } = await $.spawn('curl -s https://api.github.com/repos/asdf-vm/asdf/releases/latest | grep \'"tag_name":\' | sed -E \'s/.*"([^"]+)".*/\\1/\'');

      // Create .asdf directory if it doesn't exist
      const asdfDir = path.join(os.homedir(), '.local', 'bin');
      await fs.mkdir(asdfDir, { recursive: true });
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codify-asdf'));
      const arch = (await Utils.isArmArch()) ? 'arm64' : 'amd64';

      // Download and extract asdf
      await $.spawn(`curl -Lo ${tmpDir}/asdf.tar.gz "https://github.com/asdf-vm/asdf/releases/download/${latestVersion}/asdf-${latestVersion}-linux-${arch}.tar.gz"`, { cwd: tmpDir });
      console.log(await $.spawn('ls -la', { cwd: tmpDir }));
      await $.spawn(`tar -xzf ${tmpDir}/asdf.tar.gz -C ${asdfDir}`, { cwd: tmpDir });
      await fs.chmod(path.join(asdfDir, 'asdf'), 0o755);

      await fs.rm(tmpDir, { recursive: true, force: true });

      await FileUtils.addPathToShellRc(path.join(os.homedir(), '.local', 'bin'), true);
    }

    // eslint-disable-next-line no-template-curly-in-string
    await FileUtils.addToShellRc('export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"')
  }

  async destroy(): Promise<void> {
    const $ = getPty();

    const asdfDir = (await $.spawn('which asdf', { interactive: true })).data;
    if (Utils.isMacOS() && asdfDir.includes('homebrew')) {
      if (!(await Utils.isHomebrewInstalled())) {
        return;
      }

      await $.spawn('brew uninstall asdf', { interactive: true, env: { HOMEBREW_NO_AUTO_UPDATE: 1 } });
    } else {
      await fs.rm(asdfDir, { recursive: true, force: true });
    }

    // eslint-disable-next-line no-template-curly-in-string
    await FileUtils.removeLineFromShellRc('export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"')
    await fs.rm(path.join(os.homedir(), '.asdf'), { recursive: true, force: true });
  }

}
