export default async function loadRubyVersions(): Promise<string[]> {
  const response = await fetch('https://api.github.com/repos/rbenv/ruby-build/contents/share/ruby-build', {
    headers: { 'User-Agent': 'codify-completions-cron' },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status} ${await response.text()}`)
  }

  const data = await response.json() as { name: string }[]

  // "latest" is a keyword supported by the rbenv resource, not a real ruby-build definition.
  return ['latest', ...data.map((entry) => entry.name)]
}
