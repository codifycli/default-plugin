export default async function loadHomebrewFormulae(): Promise<string[]> {
  const response = await fetch('https://formulae.brew.sh/api/formula.json')
  const data = await response.json() as Record<string, any>[]
  return data.map((d: any) => d.name as string)
}
