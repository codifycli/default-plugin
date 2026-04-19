export default async function loadRubyVersions(): Promise<string[]> {
  const response = await fetch('https://api.github.com/repos/rbenv/ruby-build/contents/share/ruby-build')
  const data = await response.json() as { name: string }[]

  return data.map((entry) => entry.name)
}