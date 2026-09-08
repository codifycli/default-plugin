import * as cp from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import * as url from 'node:url';
import { createRequire } from 'node:module';
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js';

const DOCS_BASE_URL = 'https://codifycli.com';
const DOCS_DIR = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'docs', 'resources', '(resources)');

function buildDocUrlMap(dir: string, urlPrefix: string, knownTypes?: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      buildDocUrlMap(path.join(dir, entry.name), `${urlPrefix}/${entry.name}`, knownTypes)
        .forEach((v, k) => map.set(k, v));
    } else if (entry.name.endsWith('.mdx')) {
      const type = entry.name.replace(/\.mdx$/, '');
      if (knownTypes && !knownTypes.has(type)) {
        throw new Error(`Doc file "${entry.name}" does not match any known resource type. Check the filename.`);
      }
      map.set(type, `${DOCS_BASE_URL}${urlPrefix}/${type}`);
    }
  }
  return map;
}

const docUrlMap = buildDocUrlMap(DOCS_DIR, '/docs/resources');

const require = createRequire(import.meta.url);

/**
 * Runs a shell command and aborts the deploy if it fails.
 *
 * spawnSync does not throw on a non-zero exit, so every step here used to continue after a
 * failure. That let a failed bundle upload still publish a registry row pointing at a bundle
 * that was never uploaded — the CLI then downloaded R2's HTML 404 page as index.js and died
 * with "SyntaxError: Unexpected token '<'".
 */
function run(cmd: string): void {
  const { status, error } = cp.spawnSync(cmd, { shell: 'zsh', stdio: 'inherit' });

  if (error) {
    throw error;
  }

  if (status !== 0) {
    throw new Error(`Deploy step failed (exit code ${status}): ${cmd}`);
  }
}

// This should run the build
run('source ~/.zshrc; npm run build');

const PluginManifest: { minSupportedCliVersion: string | null } = require('../dist/plugin-manifest.json');

const version = process.env.npm_package_version;
if (!version) {
  throw new Error('Unable to find version');
}

const isBeta = version.includes('beta');
if (isBeta) {
  console.log('Deploying beta version!')
}

const name = process.env.npm_package_name;
if (!name) {
  throw new Error('Unable to find package name');
}

console.log(`Uploading plugin ${name}, version ${version} to cloudflare!`)

const outputFilePath = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')
run(`source ~/.zshrc; npx wrangler r2 object put plugins/${name}/${version}/index.js --file=${outputFilePath} --remote`);

const bundleUrl = `https://plugins.codifycli.com/${name}/${version}/index.js`;
console.log(`Verifying ${bundleUrl}`);

const bundleCheck = await fetch(bundleUrl);
if (!bundleCheck.ok) {
  throw new Error(`Uploaded bundle is not reachable at ${bundleUrl} (HTTP ${bundleCheck.status}). Aborting before the registry is updated.`);
}

const uploadedBundle = await bundleCheck.text();
if (!uploadedBundle.startsWith('"use strict"')) {
  throw new Error(`Bundle at ${bundleUrl} is not the expected JavaScript bundle (starts with: ${JSON.stringify(uploadedBundle.slice(0, 40))}). Aborting before the registry is updated.`);
}

console.log(`Bundle verified (${uploadedBundle.length} bytes)`);

const client = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

console.log('Upserting plugin');
const defaultPlugin = await client.from('registry_plugins').upsert({
  name: 'default',
}, { onConflict: 'name' })
  .select()
  .throwOnError();

const { id: pluginId, name: pluginName } = defaultPlugin.data![0];

const CodifySchema = require('../dist/schemas.json');

console.log('Upserting plugin version');
const versionRow = await client.from('registry_plugin_versions').upsert({
  plugin_id: pluginId,
  version,
  bundle_url: `https://plugins.codifycli.com/${name}/${version}/index.js`,
  min_cli_version: PluginManifest.minSupportedCliVersion,
  published_at: new Date().toISOString(),
  json_schema: CodifySchema,
}, { onConflict: 'plugin_id,version' })
  .select()
  .throwOnError();

await uploadResources(isBeta);

if (isBeta) {
  console.log('Deploying beta completions worker...')
  run('source ~/.zshrc; npm run build:completions && cd completions-cron && npx wrangler deploy --env beta')

  // Generate embeddings for prerelease resources so the AI agent can find them via semantic search
  console.log('Triggering vector reindex for prerelease resources...')
  const reindexKey = process.env.REINDEX_API_KEY
  if (!reindexKey) {
    console.warn('REINDEX_API_KEY not set — skipping prerelease reindex')
  } else {
    const res = await fetch('https://api.codifycli.com/v1/embeddings/reindex', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reindexKey}` },
    })
    if (!res.ok) {
      console.error(`Prerelease reindex failed: ${res.status} ${await res.text()}`)
    } else {
      const body = await res.json() as { resources_processed: number; templates_processed: number }
      console.log(`Prerelease reindex complete — resources: ${body.resources_processed}`)
    }
  }
}

if (!isBeta) {
  // Build and deploy completions as well.
  console.log('Deploying completions...')
  run('source ~/.zshrc; npm run deploy:completions')

  // Trigger vector reindex so search embeddings reflect the latest resources
  console.log('Triggering vector reindex...')
  const reindexKey = process.env.REINDEX_API_KEY
  if (!reindexKey) {
    console.warn('REINDEX_API_KEY not set — skipping reindex')
  } else {
    const res = await fetch('https://api.codifycli.com/v1/embeddings/reindex', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reindexKey}` },
    })
    if (!res.ok) {
      console.error(`Reindex failed: ${res.status} ${await res.text()}`)
    } else {
      const body = await res.json() as { resources_processed: number; templates_processed: number }
      console.log(`Reindex complete — resources: ${body.resources_processed}, templates: ${body.templates_processed}`)
    }
  }
}

// Trigger an immediate completions run so completions are populated right after deploy
// (the daily cron keeps them updated over time)
console.log('Triggering completions run...')
const workerUrl = isBeta
  ? process.env.COMPLETIONS_BETA_WORKER_URL
  : process.env.COMPLETIONS_WORKER_URL
const triggerSecret = process.env.COMPLETIONS_TRIGGER_SECRET
if (!workerUrl || !triggerSecret) {
  console.warn('COMPLETIONS_WORKER_URL / COMPLETIONS_BETA_WORKER_URL / COMPLETIONS_TRIGGER_SECRET not set — skipping completions trigger')
} else {
  const res = await fetch(`${workerUrl}/trigger`, {
    method: 'POST',
    headers: { Authorization: triggerSecret },
  })
  if (!res.ok) {
    console.error(`Completions trigger failed: ${res.status} ${await res.text()}`)
  } else {
    console.log('Completions trigger accepted (running in background on worker)')
  }
}

async function uploadResources(prerelease: boolean) {
  const Metadata: Array<Record<string, any>> = require('../dist/metadata.json');

  const metadataByType = new Map(Metadata.map((m) => [m.type, m]));

  if (!prerelease) {
    console.log('Updating latest version pointer');
    await client.from('registry_plugins')
      .update({ latest_version: version })
      .eq('id', pluginId)
      .throwOnError();
  }

  const resources = CodifySchema.items.oneOf;

  const knownTypes = new Set<string>(resources.map((r: any) => r.properties.type.const));
  buildDocUrlMap(DOCS_DIR, '/docs/resources', knownTypes);

  for (const resource of resources) {
    const type = resource.properties.type.const;
    const metadata = metadataByType.get(type);

    console.log(`Adding resource ${type} (prerelease=${prerelease})`)
    const resourceRow = await client.from('registry_resources').upsert({
      type,
      plugin_id: pluginId,
      plugin_name: pluginName,
      prerelease,
      schema: JSON.stringify(resource),
      documentation_url: docUrlMap.get(type) ?? null,
      allow_multiple: metadata?.allowMultiple ?? false,
      os: metadata?.operatingSystems ?? [],
      default_config: metadata?.defaultConfig ? JSON.stringify(metadata.defaultConfig) : null,
      example_config_1: metadata?.exampleConfigs?.example1 ? JSON.stringify(metadata.exampleConfigs.example1) : null,
      example_config_2: metadata?.exampleConfigs?.example2 ? JSON.stringify(metadata.exampleConfigs.example2) : null,
    }, { onConflict: 'type,plugin_id,prerelease' })
      .select()
      .throwOnError();

    const { id: resourceId } = resourceRow.data![0];

    const sensitiveParams: string[] = metadata?.sensitiveParameters ?? [];
    const allSensitive = sensitiveParams.includes('*');

    const parameters = Object.entries(resource.properties)
      .filter(([k]) => k !== 'type')
      .map(([key, property]) => ({
        type: (property as any).type,
        name: key,
        resource_id: resourceId,
        prerelease,
        schema: property,
        is_sensitive: allSensitive || sensitiveParams.includes(key),
      }))

    await client.from('registry_resource_parameters')
      .upsert(parameters, { onConflict: 'name,resource_id,prerelease' })
      .throwOnError();
  }
}
