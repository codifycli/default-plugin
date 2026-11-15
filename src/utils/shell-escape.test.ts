import { ParsedResourceSettings } from '@codifycli/plugin-core';
import Ajv from 'ajv';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { AliasResource } from '../resources/shell/alias/alias-resource.js';
import { AliasesResource } from '../resources/shell/aliases/aliases-resource.js';
import { EnvVarResource } from '../resources/shell/env-var/env-var-resource.js';
import { EnvVarsResource } from '../resources/shell/env-vars/env-vars-resource.js';
import { PathResource } from '../resources/shell/path/path-resource.js';
import {
  assertSafeDoubleQuotedShellValue,
  escapeSingleQuoted,
  isSafeDoubleQuotedShellValue,
  unescapeSingleQuoted
} from './shell-escape.js';

// Payloads that would run code if they were written into a shell startup file
const INJECTIONS = [
  '$(touch /tmp/pwned)',
  '`touch /tmp/pwned`',
  'a"; touch /tmp/pwned; echo "',
  'a\ntouch /tmp/pwned',
  'a\rtouch /tmp/pwned',
  'a\\"; touch /tmp/pwned; #',
  '$((1+1))',
  '${(e)EVIL}',
  '${EVIL@P}',
  '${EVIL:-$(touch /tmp/pwned)}',
];

const SAFE_VALUES = [
  '/usr/local/bin',
  '/Applications/My App/bin',
  '~/.local/bin',
  '$HOME/.bun',
  '${PNPM_HOME}/bin',
  '$HOME/a:$OTHER/b',
  "it's;fine|really&(yes)",
];

// Compiles a resource schema exactly like plugin-core's ResourceController does
function validatorFor(resource: { getSettings(): any }) {
  const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  return ajv.compile(new ParsedResourceSettings(resource.getSettings()).schema!);
}

function runInShell(line: string, command: string): string {
  return execFileSync('sh', ['-c', `${line}\n${command}`], { encoding: 'utf8', env: { HOME: '/home/test', PATH: '/usr/bin:/bin' } });
}

describe('shell escaping', () => {
  it('accepts plain values and simple variable references', () => {
    for (const value of SAFE_VALUES) {
      expect(isSafeDoubleQuotedShellValue(value), value).toBe(true);
    }
  });

  it('rejects values the shell would evaluate inside double quotes', () => {
    for (const value of INJECTIONS) {
      expect(isSafeDoubleQuotedShellValue(value), value).toBe(false);
      expect(() => assertSafeDoubleQuotedShellValue(value, 'value'), value).toThrow(/Unsafe value/);
    }
  });

  it('round trips single quoted values', () => {
    const value = "echo 'hi' && x='$(y)'";
    expect(unescapeSingleQuoted(escapeSingleQuoted(value))).toBe(value);
    expect(runInShell(`V='${escapeSingleQuoted(value)}'`, 'printf "%s" "$V"')).toBe(value);
  });

  describe('env-var', () => {
    const validate = validatorFor(new EnvVarResource());

    it('schema rejects unsafe values', () => {
      for (const value of SAFE_VALUES) {
        expect(validate({ variable: 'FOO', value }), value).toBe(true);
      }

      for (const value of INJECTIONS) {
        expect(validate({ variable: 'FOO', value }), value).toBe(false);
      }
    });

    it('never writes an unsafe declaration', () => {
      const resource = new EnvVarResource() as any;
      expect(resource.declarationString('FOO', '$HOME/.bun')).toBe('export FOO="$HOME/.bun"');
      expect(runInShell(resource.declarationString('FOO', "$HOME/x;y|z'"), 'printf "%s" "$FOO"')).toBe("/home/test/x;y|z'");

      for (const value of INJECTIONS) {
        expect(() => resource.declarationString('FOO', value), value).toThrow(/Unsafe/);
      }
    });
  });

  describe('env-vars', () => {
    const validate = validatorFor(new EnvVarsResource());

    it('schema rejects unsafe names and values', () => {
      expect(validate({ vars: SAFE_VALUES.map((value, i) => ({ variable: `V_${i}`, value })) })).toBe(true);

      for (const value of INJECTIONS) {
        expect(validate({ vars: [{ variable: 'FOO', value }] }), value).toBe(false);
      }

      for (const variable of ['FOO=1; touch /tmp/pwned; X', '1FOO', 'FOO BAR', '$(x)', '']) {
        expect(validate({ vars: [{ variable, value: 'a' }] }), variable).toBe(false);
      }
    });

    it('never writes an unsafe declaration', () => {
      const resource = new EnvVarsResource() as any;
      expect(() => resource.declarationString('FOO=1; touch /tmp/pwned; X', 'a')).toThrow(/Invalid env var name/);
      for (const value of INJECTIONS) {
        expect(() => resource.declarationString('FOO', value), value).toThrow(/Unsafe/);
      }
    });
  });

  describe('aliases', () => {
    const validate = validatorFor(new AliasesResource());

    it('schema rejects unsafe alias names but allows any value', () => {
      expect(validate({ aliases: [{ alias: 'gs', value: "git status && echo 'done'" }] })).toBe(true);
      expect(validate({ aliases: [{ alias: 'll', value: "x'; touch /tmp/pwned; '" }] })).toBe(true);

      for (const alias of ['x=1; touch /tmp/pwned #', 'a b', 'a;b', '$(x)', '`x`', "a'b", 'a\nb', '']) {
        expect(validate({ aliases: [{ alias, value: 'ls' }] }), alias).toBe(false);
      }
    });

    it('escapes values so they cannot break out of the quotes', () => {
      const resource = new AliasesResource() as any;
      const value = "x'; touch /tmp/pwned; echo '";
      const line = resource.aliasString('ll', value);
      expect(line).toBe(`alias ll='x'\\''; touch /tmp/pwned; echo '\\'''`);

      // Same escaping as the singular alias resource so declarations stay interchangeable
      expect(line).toBe((new AliasResource() as any).aliasString('ll', value));
      expect(() => resource.aliasString('x=1; touch /tmp/pwned #', 'ls')).toThrow(/Invalid alias name/);
    });
  });

  describe('path', () => {
    const validate = validatorFor(new PathResource());

    it('schema rejects unsafe paths', () => {
      for (const value of SAFE_VALUES) {
        expect(validate({ path: value }), value).toBe(true);
        expect(validate({ paths: [value] }), value).toBe(true);
      }

      for (const value of [...INJECTIONS, '/opt/bin; touch /tmp/pwned']) {
        if (!value.includes(';')) {
          expect(validate({ path: value }), value).toBe(false);
          expect(validate({ paths: ['/ok', value] }), value).toBe(false);
        }
      }
    });

    it('custom validation rejects unsafe paths', async () => {
      const resource = new PathResource();
      await expect(resource.validate({ path: '$(touch /tmp/pwned)' })).rejects.toThrow(/Unsafe path/);
      await expect(resource.validate({ paths: ['/ok', '`touch /tmp/pwned`'] })).rejects.toThrow(/Unsafe path/);
      await expect(resource.validate({ paths: ['/ok', '$HOME/bin'] })).resolves.toBeUndefined();
    });
  });
});
