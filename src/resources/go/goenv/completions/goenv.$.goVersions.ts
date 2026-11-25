export default async function loadGoVersions(): Promise<string[]> {
  const response = await fetch('https://go.dev/dl/?mode=json&include=all')
  if (!response.ok) {
    throw new Error(`Unable to load Go versions: ${response.status} ${await response.text()}`)
  }

  const releases = await response.json() as Array<{ version: string }>

  // "latest" is a keyword supported by the goenv resource, not a real go.dev release.
  // go.dev reports versions as go1.22.0; goenv expects 1.22.0
  return ['latest', ...releases.map((r) => r.version.replace(/^go/, ''))]
}
