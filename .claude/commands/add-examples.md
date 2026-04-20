# add-examples

Add `defaultConfig` and `exampleConfigs` to a Codify resource.

## Instructions

The user will either pass a file path as an argument (`$ARGUMENTS`) or have a file open in the IDE. Read the resource file, then follow the rules below to add `defaultConfig` and `exampleConfigs`.

If `$ARGUMENTS` is provided, use that file path. Otherwise use the file the user has open.

### Step 1 — Read the resource

Read the resource file. Identify:
- The config interface/type (fields, which are required vs optional)
- `operatingSystems` declared in `getSettings()` — determines whether to add `os` to examples
- `dependencies` — used to decide whether to show a multi-resource example
- Any existing `defaultConfig` or `exampleConfigs` (update rather than duplicate)

If the schema is a separate JSON file, read it too.

Also check for sibling resources that are commonly used together (e.g. if this resource `dependsOn` another type, read that type's file to understand its config shape).

### Step 2 — Add `defaultConfig`

Rules:
- Type: `Partial<TheConfig>` (never include `os` — it's not on the typed config interface)
- For required fields with no sensible default: use the placeholder string `'<Replace me here!'>`
- For optional arrays that default to empty: set to `[]`
- Omit fields that are purely user-specific (paths, names, credentials)
- Use the tool's own documented defaults where applicable

### Step 3 — Add `exampleConfigs`

Rules:
- Up to two examples: `example1` and `example2`
- **No trivial examples** — every example must have meaningful configuration, not just `{ type: 'foo' }` with no parameters
- `example1`: the most common real-world use case with substantive config values
- `example2`: a more advanced variant OR a multi-resource example showing full end-to-end setup; multi-resource is preferred when the resource `dependsOn` another
- Every example needs a `title` (short noun-phrase) and a `description` (one sentence)
- Use realistic placeholder values for sensitive fields (`'<Replace me here!'>`), not real credentials
- Do not add step-numbering in descriptions

**`os` field in examples:**
- The `os` field values come from the `ResourceOs` enum in `@codifycli/schemas` (`../codify-schemas/src/types/index.ts`): `'macOS'`, `'linux'`, `'windows'`
- Add `os` to config entries inside examples only when `operatingSystems` is restricted to a single OS (e.g. Darwin-only → `os: ['macOS']`, Linux-only → `os: ['linux']`)
- Skip `os` entirely when the resource supports both Darwin and Linux

**Shared examples:**
- When a multi-resource example is used across multiple related resources (e.g. asdf + asdf-plugin + asdf-install), define it once in a shared `examples.ts` file in the resource folder and spread it in with `...exampleSharedConfigs`

### Step 4 — Import `ExampleConfig`

Add `ExampleConfig` to the existing `@codifycli/plugin-core` import if not already present.

### Step 5 — Register in `getSettings()`

Add `defaultConfig` and `exampleConfigs` fields inside the object returned by `getSettings()`, before `operatingSystems`.

## Output format

Make all edits directly to the file. Do not summarise every line changed — just briefly confirm what was added.