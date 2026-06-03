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

// This should run the build
cp.spawnSync('source ~/.zshrc; npm run build', { shell: 'zsh', stdio: 'inherit' });

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
cp.spawnSync(`source ~/.zshrc; npx wrangler r2 object put plugins/${name}/${version}/index.js --file=${outputFilePath} --remote`, { shell: 'zsh', stdio: 'inherit' });

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

if (!isBeta) {
  // Build and deploy completions as well.
  console.log('Deploying completions...')
  cp.spawnSync('source ~/.zshrc; npm run deploy:completions' , { shell: 'zsh', stdio: 'inherit' })
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
