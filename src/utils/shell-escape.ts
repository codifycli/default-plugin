/**
 * Validation for values written into shell startup files (.zshrc, .bashrc, etc.) inside double quotes.
 *
 * Plain characters and simple variable references ($NAME or ${NAME}) are allowed so values like `$HOME/.bun` keep
 * working. Command substitution `$(...)`, backticks, any other `$` expansion (e.g. `$((...))`, zsh `${(e)VAR}`,
 * bash `${VAR@P}`), double quotes, backslashes and new lines are rejected.
 *
 * Mirrors `isSafeDoubleQuotedShellValue` from @codifycli/plugin-core >= 1.2.12. Switch to that export once the
 * plugin-core dependency is bumped.
 *
 * The braces are escaped so the same source can be used as a JSON schema `pattern` (ajv compiles patterns with the
 * unicode flag, where a bare `{` is a syntax error).
 */
// eslint-disable-next-line unicorn/better-regex
export const SAFE_DOUBLE_QUOTED_VALUE_REGEX = /^(?:[^\n\r"$\\`]|\$[A-Z_a-z]\w*|\$\{[A-Z_a-z]\w*\})*$/;

export const UNSAFE_SHELL_VALUE_MESSAGE = 'may only contain plain characters and simple variable references ($NAME or ${NAME}). Command substitution, backticks, quotes, backslashes and new lines are not allowed';

export function isSafeDoubleQuotedShellValue(value: string): boolean {
  return SAFE_DOUBLE_QUOTED_VALUE_REGEX.test(value);
}

export function assertSafeDoubleQuotedShellValue(value: string, description: string): void {
  if (!isSafeDoubleQuotedShellValue(value)) {
    throw new Error(`Unsafe ${description} ${JSON.stringify(value)}: values written to shell startup files ${UNSAFE_SHELL_VALUE_MESSAGE}.`);
  }
}

// Alias names must not contain whitespace or shell metacharacters. Same rule as the alias resource schema.
export const SAFE_ALIAS_NAME_REGEX = /^[^\s/\\$`=|&;()<>'"]+$/;

// Escapes single quotes for embedding inside a single-quoted shell string (POSIX ' -> '\'')
export function escapeSingleQuoted(value: string): string {
  return value.replaceAll("'", String.raw`'\''`);
}

// Reverses escapeSingleQuoted when parsing alias output that the shell echoes back
export function unescapeSingleQuoted(value: string): string {
  return value.replaceAll(String.raw`'\''`, "'");
}
