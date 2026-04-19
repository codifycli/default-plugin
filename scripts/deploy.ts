import * as cp from 'node:child_process';
import path from 'node:path';
import * as url from 'node:url';
import { createRequire } from 'node:module';
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);

const isBeta = process.env.BETA === 'true';

// This should run the build
cp.spawnSync('source ~/.zshrc; npm run build', { shell: 'zsh', stdio: 'inherit' });

const version = isBeta ? 'beta' : process.env.npm_package_version;
if (!version) {
  throw new Error('Unable to find version');
}

const name = process.env.npm_package_name;
if (!name) {
  throw new Error('Unable to find package name');
}

console.log(`Uploading plugin ${name}, version ${version} to cloudflare!`)

const outputFilePath = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'dist', 'index.js')
cp.spawnSync(`source ~/.zshrc; npx wrangler r2 object put plugins/${name}/${version}/index.js --file=${outputFilePath} --remote`, { shell: 'zsh', stdio: 'inherit' });

if (!isBeta) {
  await uploadResources();
}

async function uploadResources() {
  const CodifySchema = require('../dist/schemas.json');

  const client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  console.log('Adding default plugin');
  const defaultPlugin = await client.from('registry_plugins').upsert({
    name: 'default',
  }, { onConflict: 'name' })
    .select()
    .throwOnError();

  const { id: pluginId, name: pluginName } = defaultPlugin.data![0];
  const resources = CodifySchema.items.oneOf;

  for (const resource of resources) {
    const type = resource.properties.type.const;

    console.log(`Adding resource ${type}`)
    const resourceRow = await client.from('registry_resources').upsert({
      type,
      plugin_id: pluginId,
      plugin_name: pluginName,
      schema: JSON.stringify(resource),
      documentation_url: resource.$comment,
    }, { onConflict: ['type', 'plugin_id'] })
      .select()
      .throwOnError();

    const { id: resourceId } = resourceRow.data![0];

    const parameters = Object.entries(resource.properties)
      .filter(([k]) => k !== 'type')
      .map(([key, property]) => ({
        type: property.type,
        name: key,
        resource_id: resourceId,
        schema: property,
      }))

    await client.from('registry_resource_parameters')
      .upsert(parameters, { onConflict: ['name', 'resource_id'] })
      .throwOnError();
  }
}
