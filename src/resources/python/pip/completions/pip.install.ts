export default async function loadPipPackages(): Promise<string[]> {
  const response = await fetch('https://hugovk.dev/top-pypi-packages/top-pypi-packages.min.json')
  const data = await response.json() as { rows: { project: string }[] }

  return data.rows.map((r) => r.project)
}