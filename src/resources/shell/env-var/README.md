# env-var / env-vars

Declaratively manage shell environment variables by writing `export` declarations to your shell startup script (`~/.zshrc` or `~/.bashrc`).

Use this resource to ensure variables like `$PNPM_HOME`, `$PYENV_ROOT`, or `$BUN_INSTALL` are always set on a fresh machine.

## Resources

| Resource | Description |
|---|---|
| `env-var` | Manages a single environment variable. Supports multiple independent declarations via `allowMultiple`. |
| `env-vars` | Manages a collection of environment variables in one config block. |

## Usage

### Single variable (`env-var`)

```jsonc
// codify.jsonc
[
  { "type": "env-var", "variable": "PNPM_HOME", "value": "$HOME/Library/pnpm" },
  { "type": "env-var", "variable": "BUN_INSTALL", "value": "$HOME/.bun" }
]
```

### Multiple variables (`env-vars`)

```jsonc
// codify.jsonc
[
  {
    "type": "env-vars",
    "vars": [
      { "variable": "PNPM_HOME", "value": "$HOME/Library/pnpm" },
      { "variable": "BUN_INSTALL", "value": "$HOME/.bun" },
      { "variable": "PYENV_ROOT", "value": "$HOME/.pyenv" }
    ]
  }
]
```

## Parameters

### `env-var`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `variable` | `string` | Yes | Environment variable name (e.g. `PNPM_HOME`) |
| `value` | `string` | Yes | Value to assign |

### `env-vars`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `vars` | `Array<{ variable, value }>` | `[]` | List of variables to manage |
| `declarationsOnly` | `boolean` | `true` | When true, only manages variables explicitly exported in shell RC files. When false, considers all variables in the live environment. |

## Notes

- **PATH is excluded.** Use the `path` resource to manage `$PATH` entries.
- **Write target.** All new declarations are written to the primary shell RC file (`~/.zshrc` for zsh, `~/.bashrc` for bash).
- **Read scope.** During refresh, all known RC files are scanned so declarations added by other tools are detected.
- **Value format.** Values are written quoted: `export NAME="value"`. Shell variable references like `$HOME` are preserved as-is.
