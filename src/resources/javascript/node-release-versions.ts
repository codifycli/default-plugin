/**
 * Every Node.js release from nodejs.org plus its partial versions (22, 22.11, 22.11.0), for version completions.
 */
export async function loadNodeReleaseVersions(): Promise<string[]> {
  const response = await fetch('https://nodejs.org/dist/index.json')
  if (!response.ok) {
    throw new Error(`Unable to load Node.js versions: ${response.status} ${await response.text()}`)
  }

  const nodeVersions = await response.json() as Array<{ version: string }>

  const result = new Set<string>()
  // Skip prereleases (v27.0.0-alpha.0): nvm / fnm keywords and partial matching only resolve to stable releases
  for (const nodeVersion of nodeVersions.filter((v) => !v.version.includes('-'))) {
    const versionParts = nodeVersion.version.substring(1).split('.')

    for (let i = 0; i < versionParts.length; i++) {
      result.add(versionParts.slice(0, i + 1).join('.'))
    }
  }

  return [...result]
}
