import yaml from 'js-yaml';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const HERMES_DIR = path.join(os.homedir(), '.hermes');
export const HERMES_CONFIG_PATH = path.join(HERMES_DIR, 'config.yaml');

export type HermesYamlConfig = Record<string, unknown>;

export async function readHermesConfig(): Promise<HermesYamlConfig> {
  try {
    const content = await fs.readFile(HERMES_CONFIG_PATH, 'utf8');
    const parsed = yaml.load(content);
    return (parsed && typeof parsed === 'object') ? parsed as HermesYamlConfig : {};
  } catch {
    return {};
  }
}

export async function writeHermesConfig(config: HermesYamlConfig): Promise<void> {
  await fs.mkdir(HERMES_DIR, { recursive: true });
  await fs.writeFile(HERMES_CONFIG_PATH, yaml.dump(config), 'utf8');
}

export async function mutateHermesConfig(mutate: (config: HermesYamlConfig) => void): Promise<void> {
  const config = await readHermesConfig();
  mutate(config);
  await writeHermesConfig(config);
}
