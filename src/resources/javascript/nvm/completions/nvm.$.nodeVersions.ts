import { loadNodeReleaseVersions } from '../../node-release-versions.js'

export default async function loadNvmNodeVersions(): Promise<string[]> {
  // "latest" / "lts" are keywords supported by the nvm resource, not real nodejs.org entries.
  return ['latest', 'lts', ...await loadNodeReleaseVersions()]
}
