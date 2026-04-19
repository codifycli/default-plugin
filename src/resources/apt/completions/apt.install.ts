export default async function loadAptPackages(): Promise<string[]> {
  // Apt package enumeration requires parsing Packages.gz from a mirror
  // No simple public JSON API available - stub for now
  return []
}
