type PyenvPythonVersions = Array<{
  name: string
  path: string
  sha: string
  size: string
}>

export default async function loadPythonVersions(): Promise<string[]> {
  const response = await fetch('https://api.github.com/repos/pyenv/pyenv/contents/plugins/python-build/share/python-build', {
    method: 'GET',
    headers: {
      'User-Agent': 'CodifyCLI'
    }
  })
  if (!response.ok) {
    throw new Error(`Unable to load pyenv versions ${await response.text()}`)
  }

  const pyenvVersions = await response.json() as PyenvPythonVersions
  return pyenvVersions.map((v) => v.name)
}
