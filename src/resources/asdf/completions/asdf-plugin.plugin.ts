export default async function loadAsdfPluginNames(): Promise<string[]> {
  const response = await fetch('https://api.github.com/repos/asdf-vm/asdf-plugins/contents/plugins', {
    headers: { 'User-Agent': 'codify-completions-cron' },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as Record<string, any>[]
  return data.map((d: any) => d.name as string)
}
