export default async function loadAptPackages(): Promise<string[]> {
  const response = await fetch('https://sources.debian.org/api/list')
  const data = await response.json() as { packages: { name: string }[] }
  return data.packages.map((p) => p.name)
}
