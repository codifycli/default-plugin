import { PluginProcess } from '@codifycli/plugin-test/dist/plugin-process';
import { ResourceOperation } from '@codifycli/schemas';
import { expect } from 'vitest';

/**
 * Re-plans a config after apply and asserts nothing changes. "latest" / "lts" must converge instead of proposing an
 * install on every plan.
 */
export async function expectConverged(pluginPath: string, config: Record<string, unknown> & { type: string }): Promise<void> {
  const { type, ...desired } = config;
  const plugin = new PluginProcess(pluginPath);

  try {
    await plugin.initialize();
    const plan = await plugin.plan({ core: { type }, desired, isStateful: false, state: undefined });
    expect(plan.operation, JSON.stringify(plan, null, 2)).toBe(ResourceOperation.NOOP);
  } finally {
    plugin.kill();
  }
}
