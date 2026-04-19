import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const rawPackages: { name: string }[] = require('./raw.json')

export default async function loadNpmPackages(): Promise<string[]> {
  return rawPackages.map((p) => p.name)
}
