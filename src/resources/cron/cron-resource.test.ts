import { describe, expect, it } from 'vitest';
import { parseManagedJobs, removeJobBlock } from './cron-resource.js';

describe('CronResource unit tests', () => {
  it('parses a single managed job', () => {
    const result = parseManagedJobs('# Codify managed: my-job\n*/5 * * * * echo hello\n');
    expect(result).toMatchObject([{ name: 'my-job', schedule: '*/5 * * * *', command: 'echo hello' }]);
  });

  it('parses a job with an @special schedule', () => {
    const result = parseManagedJobs('# Codify managed: daily-job\n@daily echo hello\n');
    expect(result).toMatchObject([{ name: 'daily-job', schedule: '@daily', command: 'echo hello' }]);
  });

  it('parses multiple managed jobs', () => {
    const result = parseManagedJobs(`
# Codify managed: job-one
0 5 * * * /usr/local/bin/backup.sh

# Codify managed: job-two
*/10 * * * * /usr/local/bin/healthcheck.sh
`);
    expect(result).toMatchObject([
      { name: 'job-one', schedule: '0 5 * * *', command: '/usr/local/bin/backup.sh' },
      { name: 'job-two', schedule: '*/10 * * * *', command: '/usr/local/bin/healthcheck.sh' },
    ]);
  });

  it('ignores unmanaged crontab entries', () => {
    const result = parseManagedJobs(`
# A manual job, not managed by Codify
0 0 * * * /usr/local/bin/manual.sh

# Codify managed: managed-job
0 1 * * * /usr/local/bin/managed.sh
`);
    expect(result).toMatchObject([{ name: 'managed-job', schedule: '0 1 * * *', command: '/usr/local/bin/managed.sh' }]);
  });

  it('removes a managed job block by name', () => {
    const content = `0 0 * * * /usr/local/bin/manual.sh
# Codify managed: job-one
0 5 * * * /usr/local/bin/backup.sh
# Codify managed: job-two
*/10 * * * * /usr/local/bin/healthcheck.sh`;

    const result = removeJobBlock(content, 'job-one');

    expect(result).to.not.include('job-one');
    expect(result).to.not.include('/usr/local/bin/backup.sh');
    expect(result).to.include('# Codify managed: job-two');
    expect(result).to.include('/usr/local/bin/healthcheck.sh');
    expect(result).to.include('/usr/local/bin/manual.sh');
  });

  it('removeJobBlock is a no-op when the job is not present', () => {
    const content = '# Codify managed: job-two\n*/10 * * * * /usr/local/bin/healthcheck.sh';
    const result = removeJobBlock(content, 'job-one');
    expect(result).toBe(content);
  });
});
