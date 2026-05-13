# resource-completions-cron

A Cloudflare Workers scheduled job that pre-fetches auto-complete values for resource parameters in the Codify Editor. It runs daily and writes results to the `resource_parameter_completions` Supabase table.

## How It Works

### 1. Per-resource completion scripts

Each resource that supports completions has one or more scripts co-located with it in the plugin:

```
codify-homebrew-plugin/src/resources/
  homebrew/completions/
    homebrew.formulae.ts     → resource_type=homebrew, parameter_path=/formulae
    homebrew.casks.ts        → resource_type=homebrew, parameter_path=/casks
  javascript/nvm/completions/
    nvm.nodeVersions.ts      → resource_type=nvm,      parameter_path=/nodeVersions
  python/pyenv/completions/
    pyenv.pythonVersions.ts  → resource_type=pyenv,    parameter_path=/pythonVersions
```

**Naming convention:** `<resource-type>.<parameter-name>.ts`
- The filename determines the Supabase metadata — no configuration needed
- Each file exports a single `default async function(): Promise<string[]>` that fetches and returns the completion values. It has no knowledge of Supabase.

### 2. Code generation

Running `npm run build:completions` (from the plugin root) executes `scripts/generate-completions-index.ts`, which:
- Globs all `src/resources/**/completions/*.ts` files in the plugin
- Parses each filename for `resourceType` and `parameterPath`
- Writes `src/__generated__/completions-index.ts` — a static list of imports and metadata

`src/__generated__/completions-index.ts` is auto-generated. **Do not edit it by hand.**

### 3. Orchestrator

`src/index.ts` is the Cloudflare Workers entry point. It:
- Imports `completionModules` from the generated index
- For each module, calls the `fetch()` function to get `string[]` values
- Looks up the `resource_id` from the `registry_resources` Supabase table
- Deletes old completions and batch-inserts new ones (1000 rows per batch) into `resource_parameter_completions`
- Runs all modules concurrently via `Promise.allSettled`

## Commands

All commands are run from the **plugin root** (`codify-homebrew-plugin/`):

```bash
# Regenerate src/__generated__/completions-index.ts
npm run build:completions

# Build + deploy to Cloudflare Workers
npm run deploy:completions
```

To run/test locally (from this directory):

```bash
# Start local wrangler dev server with scheduled trigger support
npm run dev

# Trigger the scheduled handler manually against the local server
npm run start:cron
```

## Adding a New Completion

1. Create `src/resources/<category>/<resource>/completions/<type>.<param>.ts` in the plugin
2. Export a default async function returning `string[]`
3. Run `npm run build:completions` from the plugin root to regenerate the index
4. Run `npm run deploy:completions` to deploy

No changes are needed to any file in this directory.

## Environment Variables

| Variable | Where set |
|---|---|
| `SUPABASE_URL` | `wrangler.toml` `[vars]` (public URL, safe to commit) |
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare Workers secret (set via `wrangler secret put`) |

## Schedule

The cron runs daily at 05:00 UTC (`0 5 * * *`), configured in `wrangler.toml`.
