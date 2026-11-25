import { describe, expect, it } from 'vitest';

import { SshKeyResource, parseSshKeygenFingerprint } from './ssh-key.js';

describe('ssh key unit test', () => {
  it('Returns null when the key does not exist', async () => {
    const resource = new SshKeyResource();
    const result = await resource.refresh({
      keyType: 'rsa',
      fileName: 'codify-test-key-that-does-not-exist',
      folder: '/tmp/codify-test-folder-that-does-not-exist',
      passphrase: '',
    });

    expect(result).toBeNull();
  });

  it('Parses ssh-keygen -l output', () => {
    expect(parseSshKeygenFingerprint('256 SHA256:68qyccWBhHlmPp633MmPTzbKOSBbRDn6eDw/YgwLl9Q me@example.com (ED25519)'))
      .toEqual({ bits: 256, comment: 'me@example.com', type: 'ed25519' });
    expect(parseSshKeygenFingerprint('3072 SHA256:abc+def/ghi= user@host (RSA)\n'))
      .toEqual({ bits: 3072, comment: 'user@host', type: 'rsa' });
  });

  it('Parses comments with spaces and keys without a comment', () => {
    expect(parseSshKeygenFingerprint('256 SHA256:F73x9vdB0JVBpnpY4eH+3lCCx3TOU0ZCzqA1JGqLx4w Ada Lovelace (laptop) (ED25519)'))
      .toEqual({ bits: 256, comment: 'Ada Lovelace (laptop)', type: 'ed25519' });
    expect(parseSshKeygenFingerprint('256 SHA256:F73x9vdB0JVBpnpY4eH+3lCCx3TOU0ZCzqA1JGqLx4w no comment (ED25519)'))
      .toEqual({ bits: 256, comment: '', type: 'ed25519' });
  });

  it('Returns null for unexpected output', () => {
    expect(parseSshKeygenFingerprint('id_ed25519 is not a key file.')).toBeNull();
    expect(parseSshKeygenFingerprint('')).toBeNull();
  });
});
