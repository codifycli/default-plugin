export default async function loadSnapPackages(): Promise<string[]> {
  const response = await fetch('https://snapcraft.io/store/sitemap.xml')
  const xml = await response.text()

  const matches = xml.matchAll(/<loc>https:\/\/snapcraft\.io\/([^<]+)<\/loc>/g)

  return [...matches]
    .map((m) => m[1])
    .filter((name) => name !== 'store')
}
