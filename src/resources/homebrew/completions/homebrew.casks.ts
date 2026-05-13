export default async function loadHomebrewCasks(): Promise<string[]> {
  const response = await fetch('https://formulae.brew.sh/api/cask.json')
  const data = await response.json() as Record<string, any>[]
  return [...new Set(data.flatMap((d: any) => d.full_token as string))]
}
