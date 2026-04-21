# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Codify plugin** that provides 50+ declarative system configuration resources (Homebrew, Git, shell aliases, Python environments, etc.) built on the `@codifycli/plugin-core` framework. Users write JSON configurations describing their desired system state, and the framework generates and executes plans to achieve that state.

## Build and Test Commands

```bash
# Build the plugin (compiles TypeScript, bundles with Rollup, generates schemas.json)
npm run build

# Run all tests (unit + integration)
npm test

# Run unit tests only (fast - tests in src/**/*.test.ts)
npm run test:unit

# Run integration tests only (slow - full lifecycle tests in test/**/*.test.ts)
npm run test:integration

# Run integration tests in development mode
npm run test:integration:dev

# Deploy to Cloudflare R2
npm run deploy

# Deploy beta version
npm run deploy:beta
```

**Running a single test:**
```bash
# Unit test
npx vitest src/resources/shell/path/path-resource.test.ts

# Integration test
npx vitest test/shell/path.test.ts
```

## Core Architecture

### Plugin System

This plugin uses a **Resource-based architecture** where:

1. Each resource type (git, homebrew, alias, etc.) extends the `Resource<ConfigType>` base class from `@codifycli/plugin-core`
2. Resources are registered in `src/index.ts` via `Plugin.create('default', [resource instances])`
3. Resources implement 5 core lifecycle methods:
   - `getSettings()` - Define schema, parameters, dependencies, OS support
   - `refresh()` - Read current system state
   - `create()` - Create new resource
   - `modify()` - Modify existing resource (optional)
   - `destroy()` - Remove resource

### Resource Registration

All resources are registered in `/src/index.ts`:

```typescript
runPlugin(Plugin.create('default', [
  new GitResource(),
  new HomebrewResource(),
  new AliasResource(),
  // ... 50+ more resources
]))
```

### Resource Lifecycle Pattern

Every resource follows this pattern:

```typescript
export class MyResource extends Resource<MyConfig> {
  getSettings(): ResourceSettings<MyConfig> {
    return {
      id: 'unique-id',
      operatingSystems: [OS.Darwin, OS.Linux],
      schema: JSONSchema or ZodSchema,
      parameterSettings: { /* ... */ },
      dependencies: ['other-resource-ids'],
      allowMultiple: { /* ... */ }
    }
  }

  async refresh(params): Promise<Partial<MyConfig> | null> {
    // Returns null if resource doesn't exist
    // Returns object with current state if it exists
  }

  async create(plan): Promise<void> { /* ... */ }
  async modify(pc, plan): Promise<void> { /* ... */ }
  async destroy(plan): Promise<void> { /* ... */ }
}
```

### Three Resource Complexity Levels

**1. Simple Singleton** (e.g., `shell/alias/alias-resource.ts`):
- One resource instance per config entry
- Uses `allowMultiple.identifyingParameters: ['alias']` to support multiple aliases
- Each unique identifying parameter value becomes a separate resource

**2. Multi-Declaration** (e.g., `shell/aliases/aliases-resource.ts`):
- Manages multiple items in a single resource (array of aliases)
- Uses Zod schemas for type safety
- Implements `declarationsOnly` mode for stateless/stateful behavior

**3. Complex with Auto-Discovery** (e.g., `git/repository/git-repository.ts`):
- Supports multiple configuration modes (single repo vs multiple repos)
- Uses `allowMultiple.matcher()` for custom matching logic
- Uses `allowMultiple.findAllParameters()` for system discovery
- Declares `dependencies` to ensure prerequisites are met

## Declarative vs Stateful Resources

**CRITICAL DISTINCTION:**

### Declarative Mode (Default)
- Framework only manages **explicitly declared items** in the config
- System state is filtered to match declarations
- Safer default - won't accidentally capture unwanted system state
- Example: Only manage the paths/aliases the user explicitly listed

**Implementation:**
```typescript
parameterSettings: {
  paths: {
    filterInStatelessMode: (desired, current) =>
      current.filter((c) => desired.some((d) => d === c))
  }
}
```

### Stateful Mode (Opt-in)
- Framework manages **complete state** of resource
- Tracks what changed over time (additions/removals)
- Uses `StatefulParameter` classes with `add()`, `modify()`, `remove()` methods
- Example: Homebrew formulae - track all installed packages

**Implementation:**
```typescript
parameterSettings: {
  formulae: {
    type: 'stateful',
    definition: new FormulaeParameter(),
    order: 2
  }
}
```

## Schema Validation

Two approaches are supported:

**1. JSON Schema** (traditional):
```typescript
// Separate .json file
import Schema from './my-resource-schema.json'

export interface MyConfig extends StringIndexedObject {
  field: string
}

getSettings() {
  return { schema: Schema }
}
```

**2. Zod Schema** (preferred):
```typescript
// Single source of truth - schema and types in sync
export const schema = z.object({
  field: z.string(),
  optional: z.boolean().optional(),
})

export type MyConfig = z.infer<typeof schema>

getSettings() {
  return { schema }
}
```

Zod is preferred because types are automatically inferred from the schema, preventing drift between validation and TypeScript types.

## Testing Strategy

### Unit Tests (`src/**/*.test.ts`)
- Fast tests for parsing, regex, data transformation
- No system calls
- Test individual functions in isolation

### Integration Tests (`test/**/*.test.ts`)
- Full lifecycle tests against real system
- Uses `PluginTester.fullTest()` from `@codifycli/plugin-test`
- Tests create → modify → destroy flow
- Includes validation callbacks

**Integration Test Pattern:**
```typescript
import { PluginTester } from '@codifycli/plugin-test'

await PluginTester.fullTest(pluginPath, [
  { type: 'alias', alias: 'my-alias', value: 'ls -l' }
], {
  validateApply: async () => {
    // Verify resource was created
  },
  testModify: {
    modifiedConfigs: [{ type: 'alias', alias: 'my-alias', value: 'pwd' }],
    validateModify: async () => {
      // Verify modification succeeded
    }
  },
  validateDestroy: async () => {
    // Verify resource was removed
  }
})
```

### Test Setup (`test/setup.ts`)
- Global `beforeAll` saves shell RC state and ensures prerequisites (Xcode, Homebrew on macOS)
- Global `afterAll` restores shell RC to original state
- Platform-specific setup using `TestUtils`

## Framework Utilities

The `@codifycli/plugin-core` framework provides:

**Shell/PTY Access:**
```typescript
const $ = getPty()

// Safe spawn (never throws, returns status)
const { data, status } = await $.spawnSafe('command')
if (status === SpawnStatus.ERROR) { /* handle */ }

// Regular spawn (throws on error)
const { data } = await $.spawn('command', {
  interactive: true,
  cwd: '/path',
  requiresRoot: true,
  env: { VAR: 'value' }
})
```

**Never use `sudo` inside `$.spawn` or `$.spawnSafe`.** Use `{ requiresRoot: true }` in the options instead. The framework handles privilege escalation through the parent process.

```typescript
// Wrong
await $.spawn('sudo rm -f /usr/local/bin/ollama');

// Correct
await $.spawn('rm -f /usr/local/bin/ollama', { requiresRoot: true });
```

**File Operations:**
```typescript
await FileUtils.addToStartupFile(lineToAdd)
await FileUtils.addToShellRc(lineToAdd)
await FileUtils.addPathToPrimaryShellRc(pathValue, prepend)
await FileUtils.removeLineFromFile(filePath, lineContent)
await FileUtils.fileExists(path)
await FileUtils.dirExists(path)
```

**OS Detection:**
```typescript
Utils.isMacOS()
Utils.isLinux()
Utils.isWindows()
```

**Package Installation:**

Always use `Utils.installViaPkgMgr(pkg)` from `@codifycli/plugin-core` to install system packages. This is platform-agnostic and automatically dispatches to the correct package manager (Homebrew on macOS, apt on Debian/Ubuntu, etc.). Never hardcode package manager calls like `brew install`, `apt-get install -y`, or `sudo apt install` in resource code.

```typescript
// Correct — works on macOS and Linux
await Utils.installViaPkgMgr('curl');
await Utils.uninstallViaPkgMgr('curl');

// Wrong — hardcoded to a specific platform/package manager
await $.spawn('sudo apt-get install -y curl');
await $.spawn('brew install curl');
```

This applies to prerequisite checks too. When a resource needs a system dependency (e.g. `curl`, `git`, `make`), always install via `Utils.installViaPkgMgr` rather than spawning a package manager directly.

**Imports — `Utils` from plugin-core vs local utils:**

Always import `Utils` from `@codifycli/plugin-core`, not from `../../utils` or `../../../utils`. The local `src/utils/` module contains macOS-specific helpers (`findApplication`, `isArmArch`, `isRosetta2Installed`, `downloadUrlIntoFile`, etc.) that are only needed when those specific capabilities are required. For everything else — OS detection, package management, shell utilities — use the plugin-core `Utils`.

```typescript
// Correct
import { Utils } from '@codifycli/plugin-core';

// Only use local utils when you specifically need macOS/spotlight helpers
import { Utils as LocalUtils } from '../../../utils/index.js';
```

## Build Process

The build process (`scripts/build.ts`) does:

1. Removes `dist/` folder
2. Runs Rollup to compile TypeScript → ES modules
3. Forks the built plugin and queries it for all resource schemas
4. Merges each resource schema with base `ResourceSchema`
5. Rebuilds with Rollup → CommonJS
6. Writes `dist/schemas.json` containing all resource schemas

The `dist/schemas.json` file is used by the CLI for validation and documentation.

## Deploy Process

Deployment (`scripts/deploy.ts`) uploads the built plugin to Cloudflare R2:
- Production: `plugins/{name}/{version}/index.js`
- Beta: `plugins/{name}/beta/index.js`

## Completions System

The Codify Editor supports auto-complete for certain resource parameters (e.g. Homebrew formula names, Node.js versions). These completions are pre-fetched by a Cloudflare Workers cron job that lives in `completions-cron/`.

### Adding completions for a parameter

1. Create `src/resources/<category>/<resource>/completions/<type>.<param>.ts`
2. Export a default async function returning `Promise<string[]>` — fetch the values, return them, nothing else
3. The filename determines the Supabase metadata automatically:
   - `homebrew.formulae.ts` → `resource_type=homebrew`, `parameter_path=/formulae`
4. Run `npm run build:completions` to regenerate the index

```bash
npm run build:completions   # regenerate completions-cron/src/__generated__/completions-index.ts
npm run deploy:completions  # build + deploy to Cloudflare Workers
```

### How it fits together

```
src/resources/**/completions/*.ts   ← per-resource fetch scripts (return string[])
        ↓  npm run build:completions
completions-cron/src/__generated__/completions-index.ts   ← AUTO-GENERATED, do not edit
completions-cron/src/index.ts       ← orchestrator: Supabase writes, scheduled handler
        ↓  wrangler deploy
Cloudflare Workers (runs daily at 05:00 UTC)
```

See `completions-cron/README.md` for full details.

## Key Patterns

### allowMultiple Configuration

**Simple boolean:**
```typescript
allowMultiple: true
```

**With identifying parameters:**
```typescript
allowMultiple: {
  identifyingParameters: ['path']  // Each unique 'path' = different resource
}
```

**With custom matcher and auto-discovery:**
```typescript
allowMultiple: {
  matcher: (desired, current) => desired.directory === current.directory,
  async findAllParameters() {
    // Discover all instances on system
    return [{ directory: '...' }, ...]
  }
}
```

### Parameter Settings

```typescript
parameterSettings: {
  // Boolean setting (not tracked in state)
  skipAlreadyInstalledCasks: {
    type: 'boolean',
    default: true,
    setting: true
  },

  // Directory path
  directory: {
    type: 'directory'
  },

  // Modifiable array
  paths: {
    type: 'array',
    itemType: 'directory',
    canModify: true,
    isElementEqual: (a, b) => a === b,
    filterInStatelessMode: (desired, current) => /* ... */
  },

  // Stateful parameter with custom handler
  formulae: {
    type: 'stateful',
    definition: new FormulaeParameter(),
    order: 2
  }
}
```

### defaultConfig and exampleConfigs

Every resource should have a `defaultConfig` and `exampleConfigs`. These are surfaced in the Codify Editor to help users get started quickly.

**`defaultConfig`** — pre-fills the resource form with sensible starting values:
- Use Syncthing's/asdf's/AWS's own documented defaults where applicable
- For required fields with no sensible default (e.g. `deviceId`, `plugin`, `awsAccessKeyId`), use the placeholder string `'<Replace me here!'>`
- For optional array fields that default to empty (e.g. `plugins`, `aliases`, `paths`), set them to `[]`
- Omit fields that are purely user-specific (e.g. paths, names, credentials) — don't guess
- If the resource declares `operatingSystems: [OS.Darwin]` or `operatingSystems: [OS.Linux]` (i.e. only one OS, not both), do NOT add `os` to `defaultConfig` (it's not on the typed config interface). Instead, add the correct `os` value only to the config entries inside `exampleConfigs`. Skip entirely when the resource supports both OS.
- The `os` field values come from the `ResourceOs` enum in `@codifycli/schemas` (`../codify-schemas/src/types/index.ts`): use `'macOS'` for Darwin, `'linux'` for Linux, `'windows'` for Windows (e.g. `os: ['macOS']`, not `os: ['darwin']`).

**`exampleConfigs`** — up to two named examples (`example1`, `example2`):
- `example1`: a substantive example showing the most common real-world use case with meaningful configuration — not a trivial "just install it" with no parameters
- `example2`: either a more advanced single-resource variant, OR a multi-resource example that shows the full end-to-end setup (e.g. install the tool + configure it)
- Multi-resource examples (configs array with multiple types) are especially useful when the resource `dependsOn` another — show installing the dependency too
- Every example needs a `title` (short, noun-phrase) and a `description` (one sentence explaining what it does and why)
- Use realistic but obviously-placeholder values for sensitive fields (`'<Replace me here!'>`), not real credentials
- Don't add step-numbering ("Step 1 of 3") in descriptions — it doesn't make sense when viewed from a single resource page
- If the resource is OS-specific (only Darwin or only Linux), add the correct `os` value to each config entry in the example so the editor filters it correctly (e.g. `os: ['macOS']`)

**Structure:**
```typescript
import { ExampleConfig } from '@codifycli/plugin-core';

const defaultConfig: Partial<MyConfig> = {
  someField: 'sensible-default',
  optionalArray: [],
  // Add os: ['macOS'] or os: ['linux'] if operatingSystems is not [OS.Darwin, OS.Linux]
}

const exampleBasic: ExampleConfig = {
  title: 'Basic my-resource setup',
  description: 'One sentence explaining what this example does and who it is for.',
  configs: [{
    type: 'my-resource',
    someField: 'example-value',
    // Add os: ['macOS'] or os: ['linux'] if the resource is OS-specific
  }]
}

const exampleWithDependency: ExampleConfig = {
  title: 'Full my-resource setup',
  description: 'Install the prerequisite and configure my-resource in one go.',
  configs: [
    { type: 'prerequisite-resource' },
    { type: 'my-resource', someField: 'example-value' },
  ]
}

// Inside getSettings():
return {
  id: 'my-resource',
  defaultConfig,
  exampleConfigs: {
    example1: exampleBasic,
    example2: exampleWithDependency,
  },
  // ...
}
```

**When there is a shared multi-resource example** (e.g. the asdf full-install example used across `asdf`, `asdf-plugin`, and `asdf-install`): define it once in a separate `examples.ts` file in the resource folder and spread it into `exampleConfigs` using `...exampleSharedConfigs`. Use a consistent description across all three rather than per-resource step labels.

### Dependencies

Resources can declare dependencies on other resources:

```typescript
getSettings() {
  return {
    dependencies: ['ssh-key', 'git']  // Apply these first
  }
}
```

The framework automatically validates dependencies exist and orders execution.

### Return Semantics in refresh()

- `null` = Resource doesn't exist on system
- `{}` = Resource exists with no state to track
- Return `null` if refresh fails or resource not found

## Platform-Specific Development

### macOS Considerations
- File paths are case-insensitive
- Use `.toLowerCase()` when comparing paths in `allowMultiple.matcher()`
- Xcode Command Line Tools required for many operations
- Homebrew commonly used for package management

### Linux Considerations
- File paths are case-sensitive
- Multiple package managers (apt, yum, dnf, snap)
- Shell RC files vary by distribution

### Cross-Platform Patterns
- Always declare `operatingSystems` in `getSettings()`
- Use `Utils.isMacOS()`, `Utils.isLinux()` for platform-specific logic
- Use `FileUtils` for cross-platform file operations
- Test on both macOS and Linux when possible

## Adding a New Resource

1. Create directory: `src/resources/category/resource-name/`
2. Create schema file (JSON or Zod): `resource-name-schema.json` or inline Zod
3. Create resource class extending `Resource<ConfigType>`
4. Implement all required lifecycle methods
5. Register in `src/index.ts`
6. Create integration test in `test/category/resource-name.test.ts`
7. Run `npm run test` to validate

## Important Files

**Core:**
- `/src/index.ts` - Resource registration
- `/codify.json` - Example configuration

**Build:**
- `/scripts/build.ts` - Build process with schema collection
- `/scripts/deploy.ts` - Deployment to Cloudflare R2
- `/scripts/generate-completions-index.ts` - Generates completions-cron entry index
- `/rollup.config.js` - Bundling configuration
- `/tsconfig.json` - TypeScript config (ES2024, strict mode)
- `/vitest.config.ts` - Test runner config

**Completions cron:**
- `/completions-cron/src/index.ts` - Cloudflare Workers scheduled handler
- `/completions-cron/src/__generated__/completions-index.ts` - Auto-generated, do not edit
- `/completions-cron/wrangler.toml` - Worker config (schedule, env vars)
- `/completions-cron/README.md` - Full documentation

**Testing:**
- `/test/setup.ts` - Global test setup/teardown
- `/test/test-utils.ts` - Test helpers

**Example Resources (by complexity):**
- Simple: `src/resources/shell/alias/alias-resource.ts`
- Multi-item: `src/resources/shell/aliases/aliases-resource.ts`
- Complex: `src/resources/git/repository/git-repository.ts`
- Stateful: `src/resources/homebrew/homebrew.ts`
