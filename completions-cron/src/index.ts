import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { completionModules, type CompletionModule } from './completions-index.js'

const BATCH_SIZE = 1000

async function getResourceId(
  supabase: SupabaseClient,
  resourceType: string,
  cache: Map<string, string>
): Promise<string> {
  if (cache.has(resourceType)) {
    return cache.get(resourceType)!
  }

  const { data, error } = await supabase
    .from('registry_resources')
    .select('id')
    .eq('type', resourceType)

  if (error || !data?.[0]?.id) {
    throw new Error(`Resource type '${resourceType}' not found in registry_resources`)
  }

  cache.set(resourceType, data[0].id)
  return data[0].id
}

async function processModule(
  supabase: SupabaseClient,
  resourceType: string,
  parameterPath: string,
  fetchFn: () => Promise<string[]>,
  resourceIdCache: Map<string, string>
): Promise<void> {
  console.log(`Processing ${resourceType}${parameterPath}...`)

  const values = await fetchFn()
  console.log(`  [${resourceType}${parameterPath}] Fetched ${values.length} values`)

  const resourceId = await getResourceId(supabase, resourceType, resourceIdCache)

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
      throw new Error(`Insert failed for ${resourceType}${parameterPath}: ${error.message}`)
    }
  }

  console.log(`  [${resourceType}${parameterPath}] Done: inserted ${values.length} completions`)
}

export default {
  async fetch(req: Request) {
    const url = new URL(req.url)
    url.pathname = '/__scheduled'
    url.searchParams.append('cron', '* * * * *')
    return new Response(`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`)
  },

  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('hihi')
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    const resourceIdCache = new Map<string, string>()

    const results = await Promise.allSettled(
      completionModules.map(({ resourceType, parameterPath, fetch }: CompletionModule) =>
        processModule(supabase, resourceType, parameterPath, fetch, resourceIdCache)
      )
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('Completion module failed:', result.reason)
      }
    }

    console.log('Successfully processed all resource completion tasks')
  },
} satisfies ExportedHandler<Env>
