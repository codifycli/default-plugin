import * as cp from 'node:child_process';
import path from 'node:path';
import * as url from 'node:url';
import { createRequire } from 'node:module';
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js';

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

console.log('Adding default plugin');
const defaultPlugin = await client.from('registry_plugins').upsert({
  name: 'default',
  display_name: 'Default Plugin',
  homepage: 'https://codifycli.com',
  repository_url: 'https://github.com/codifycli/default-plugin',
  license: 'ISC',
}, { onConflict: 'name' })
  .select()
  .throwOnError();

const { id: pluginId, name: pluginName } = defaultPlugin.data![0];

console.log('Upserting plugin version');
const versionRow = await client.from('registry_plugin_versions').upsert({
  plugin_id: pluginId,
  version,
  bundle_url: `https://plugins.codifycli.com/${name}/${version}/index.js`,
  min_cli_version: PluginManifest.minSupportedCliVersion,
  published_at: new Date().toISOString(),
}, { onConflict: 'plugin_id,version' })
  .select()
  .throwOnError();

if (!isBeta) {
  await uploadResources();

  // Build and deploy completions as well.
  console.log('Deploying completions...')
  cp.spawnSync('source ~/.zshrc; npm run deploy:completions' , { shell: 'zsh', stdio: 'inherit' })
}

async function uploadResources() {
  const CodifySchema = require('../dist/schemas.json');
  const Metadata: Array<Record<string, any>> = require('../dist/metadata.json');

  const metadataByType = new Map(Metadata.map((m) => [m.type, m]));

  const { id: versionId } = versionRow.data![0];

  console.log('Updating latest version pointer');
  await client.from('registry_plugins')
    .update({ latest_version: version, latest_version_id: versionId })
    .eq('id', pluginId)
    .throwOnError();
  const resources = CodifySchema.items.oneOf;

  for (const resource of resources) {
    const type = resource.properties.type.const;
    const metadata = metadataByType.get(type);

    console.log(`Adding resource ${type}`)
    const resourceRow = await client.from('registry_resources').upsert({
      type,
      plugin_id: pluginId,
      plugin_name: pluginName,
      schema: JSON.stringify(resource),
      documentation_url: resource.$comment,
      allow_multiple: metadata?.allowMultiple ?? false,
      os: metadata?.operatingSystems ?? [],
      default_config: metadata?.defaultConfig ? JSON.stringify(metadata.defaultConfig) : null,
      example_config_1: metadata?.exampleConfigs?.example1 ? JSON.stringify(metadata.exampleConfigs.example1) : null,
      example_config_2: metadata?.exampleConfigs?.example2 ? JSON.stringify(metadata.exampleConfigs.example2) : null,
    }, { onConflict: ['type', 'plugin_id'] })
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
        schema: property,
        is_sensitive: allSensitive || sensitiveParams.includes(key),
      }))

    await client.from('registry_resource_parameters')
      .upsert(parameters, { onConflict: ['name', 'resource_id'] })
      .throwOnError();
  }
}
