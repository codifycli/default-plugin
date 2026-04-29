import { completionModules } from './__generated__/completions-index.js'

async function main() {
  const results = await Promise.allSettled(
    completionModules.map(async ({ resourceType, parameterPath, fetch }) => {
      const values = await fetch()
      return { resourceType, parameterPath, values }
    })
  )

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error(`FAILED: ${result.reason}`)
      continue
    }

    const { resourceType, parameterPath, values } = result.value
    const label = `${resourceType}${parameterPath}`
    console.log(`\n${label} (${values.length} total)`)
    console.log(`  Top 5: ${values.slice(0, 5).join(', ')}`)
  }
}

main().catch(console.error)