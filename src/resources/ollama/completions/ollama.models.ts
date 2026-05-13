export default async function loadOllamaModels(): Promise<string[]> {
  const response = await fetch('https://ollama.com/library?sort=popular')
  const html = await response.text()

  const matches = html.matchAll(/href="\/library\/([^"]+)"/g)
  const names = [...new Set([...matches].map((m) => m[1]))]

  return names
}
