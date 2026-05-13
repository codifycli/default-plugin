export default async function loadNvmNodeVersions(): Promise<string[]> {
  const response = await fetch('https://nodejs.org/dist/index.json')
  const nodeVersions = await response.json() as Array<{ version: string }>

  const result = new Set<string>()
  for (const nodeVersion of nodeVersions) {
    const vRemovedVersion = nodeVersion.version.substring(1)
    const versionParts = vRemovedVersion.split('.')

    for (let i = 0; i < versionParts.length; i++) {
      const partialVersion = versionParts.slice(0, i + 1).join('.')
      result.add(partialVersion)
    }
  }

  return [...result]
}
