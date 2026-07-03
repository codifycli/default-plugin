import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { completionModules, type CompletionModule } from './__generated__/completions-index.js'

const BATCH_SIZE = 1000

async function getResourceId(
  supabase: SupabaseClient,
  resourceType: string,
  prerelease: boolean,
  cache: Map<string, string>
): Promise<string> {
  const cacheKey = `${resourceType}:${prerelease}`
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!
  }

  const { data, error } = await supabase
    .from('registry_resources')
    .select('id')
    .eq('type', resourceType)
    .eq('prerelease', prerelease)

  if (error || !data?.[0]?.id) {
    throw new Error(`Resource type '${resourceType}' (prerelease=${prerelease}) not found in registry_resources`)
  }

  cache.set(cacheKey, data[0].id)
  return data[0].id
}

async function processFetchModule(
  supabase: SupabaseClient,
  resourceType: string,
  parameterPath: string,
  fetchFn: () => Promise<string[]>,
  prerelease: boolean,
  resourceIdCache: Map<string, string>
): Promise<void> {
  console.log(`Processing ${resourceType} → ${parameterPath}...`)

  const values = await fetchFn()
  console.log(`  [${resourceType} → ${parameterPath}] Fetched ${values.length} values`)

  const resourceId = await getResourceId(supabase, resourceType, prerelease, resourceIdCache)

  await supabase
    .from('resource_parameter_completions')
    .delete()
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .eq('parameter_path', parameterPath)

  const rows = values.map((value) => ({
    resource_type: resourceType,
    resource_id: resourceId,
    parameter_path: parameterPath,
    value,
  }))

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { error } = await supabase
      .from('resource_parameter_completions')
      .insert(rows.slice(i, i + BATCH_SIZE))

    if (error) {
      throw new Error(`Insert failed for ${resourceType} → ${parameterPath}: ${error.message}`)
    }
  }

  console.log(`  [${resourceType} → ${parameterPath}] Done: inserted ${values.length} completions`)
}

async function processMirrorModule(
  supabase: SupabaseClient,
  resourceType: string,
  parameterPath: string,
  mirrorParameter: string,
  prerelease: boolean,
  resourceIdCache: Map<string, string>
): Promise<void> {
  console.log(`Processing mirror ${resourceType} → ${parameterPath} (mirrors ${mirrorParameter})...`)

  const resourceId = await getResourceId(supabase, resourceType, prerelease, resourceIdCache)

  // Delete any existing metadata row for this path (value IS NULL for mirror rows)
  await supabase
    .from('resource_parameter_completions')
    .delete()
    .eq('resource_type', resourceType)
    .eq('resource_id', resourceId)
    .eq('parameter_path', parameterPath)

  const { error } = await supabase
    .from('resource_parameter_completions')
    .insert({
      resource_type: resourceType,
      resource_id: resourceId,
      parameter_path: parameterPath,
      mirror_parameter_path: mirrorParameter,
    })

  if (error) {
    throw new Error(`Mirror insert failed for ${resourceType} → ${parameterPath}: ${error.message}`)
  }

  console.log(`  [${resourceType} → ${parameterPath}] Done: mirror metadata row written`)
}

async function runCompletions(env: Env): Promise<void> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const prerelease = env.PRERELEASE === 'true'
  const resourceIdCache = new Map<string, string>()

  const results = await Promise.allSettled(
    completionModules.map((mod: CompletionModule) =>
      mod.kind === 'fetch'
        ? processFetchModule(supabase, mod.resourceType, mod.parameterPath, mod.fetch, prerelease, resourceIdCache)
        : processMirrorModule(supabase, mod.resourceType, mod.parameterPath, mod.mirrorParameter, prerelease, resourceIdCache)
    )
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Completion module failed:', result.reason)
    }
  }

  console.log('Successfully processed all resource completion tasks')
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url)

    if (req.method === 'POST' && url.pathname === '/trigger') {
      if (req.headers.get('Authorization') !== env.TRIGGER_SECRET) {
        return new Response('Unauthorized', { status: 401 })
      }
      ctx.waitUntil(runCompletions(env))
      return new Response('Triggered', { status: 202 })
    }

    url.pathname = '/__scheduled'
    url.searchParams.append('cron', '* * * * *')
    return new Response(`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`)
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runCompletions(env)
  },
} satisfies ExportedHandler<Env>
