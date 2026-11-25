import { loadNodeReleaseVersions } from '../../node-release-versions.js'

export default async function loadFnmNodeVersions(): Promise<string[]> {
  // "latest" / "lts" are keywords supported by the fnm resource, not real nodejs.org entries.
  return ['latest', 'lts', ...await loadNodeReleaseVersions()]
}
