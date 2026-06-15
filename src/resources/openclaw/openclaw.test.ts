import { describe, expect, it } from 'vitest';
import { settingsSchema } from './openclaw.js';

describe('openclaw settings schema', () => {
  it('rejects tools.policy — must use tools.allow / tools.deny directly', () => {
    const result = settingsSchema.safeParse({
      tools: { policy: { allow: ['exec', 'read'] } },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('policy');
  });

  it('rejects skills.workspace and skills.autoLoad — must use skills.load.extraDirs', () => {
    const result = settingsSchema.safeParse({
      skills: { workspace: '$HOME/openclaw-skills', autoLoad: true },
    });
    expect(result.success).toBe(false);
    const issues = JSON.stringify(result.error?.issues);
    expect(issues).toContain('workspace');
    expect(issues).toContain('autoLoad');
  });

  it('rejects cron.jobs — jobs are stored in ~/.openclaw/cron/jobs.json, not in openclaw.json', () => {
    const result = settingsSchema.safeParse({
      cron: { jobs: [{ name: 'morning-briefing', schedule: '0 7 * * *' }] },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('jobs');
  });

  it('accepts valid tools config', () => {
    const result = settingsSchema.safeParse({
      tools: { allow: ['exec', 'read', 'write', 'web_search'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid skills config with load.extraDirs', () => {
    const result = settingsSchema.safeParse({
      skills: { load: { extraDirs: ['$HOME/openclaw-skills'] } },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid cron config without jobs', () => {
    const result = settingsSchema.safeParse({
      cron: { enabled: true, maxConcurrentRuns: 8 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts the full example config shape', () => {
    const result = settingsSchema.safeParse({
      gateway: { port: 18789, bind: 'loopback' },
      agents: {
        defaults: {
          model: 'anthropic/claude-sonnet-4-6',
          workspace: '$HOME/openclaw-workspace',
          maxConcurrent: 4,
        },
      },
      channels: {
        telegram: {
          botToken: 'token',
          dmPolicy: 'allowlist',
          allowFrom: ['123456789'],
        },
      },
      tools: {
        allow: ['exec', 'read', 'write', 'web_search', 'browser', 'skills'],
      },
      skills: {
        load: { extraDirs: ['$HOME/openclaw-skills'] },
      },
      browser: { enabled: true, headless: true },
      cron: { enabled: true, maxConcurrentRuns: 8 },
    });
    expect(result.success).toBe(true);
  });

  it('passes through unknown top-level keys (hooks, session, memory, etc.)', () => {
    const result = settingsSchema.safeParse({
      hooks: { enabled: true, token: 'abc', path: '/hooks' },
      session: { dmScope: 'main' },
      memory: { backend: 'default' },
    });
    expect(result.success).toBe(true);
  });
});
