export default async function loadAsdfPlugins(): Promise<string[]> {
  const response = await fetch('https://api.github.com/repos/asdf-vm/asdf-plugins/contents/plugins')
  const data = await response.json() as Record<string, any>[]
  return data.map((d: any) => d.name as string)
}
