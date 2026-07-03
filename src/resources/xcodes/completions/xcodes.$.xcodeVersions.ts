const XCODE_RELEASES_URL = 'https://xcodereleases.com/data.json';

interface XcodeRelease {
  version: {
    number: string;
    release: { release?: boolean; beta?: number; rc?: number; dp?: number };
  };
}

function toXcodesVersionString(release: XcodeRelease): string {
  const { number, release: rel } = release.version;
  if (rel.release) return number;
  if (rel.beta != null) return `${number} Beta ${rel.beta}`;
  if (rel.rc != null) return `${number} RC ${rel.rc}`;
  if (rel.dp != null) return `${number} DP ${rel.dp}`;
  return number;
}

export default async function loadXcodeVersions(): Promise<string[]> {
  const response = await fetch(XCODE_RELEASES_URL);
  const releases = await response.json() as XcodeRelease[];
  return releases.map(toXcodesVersionString);
}
