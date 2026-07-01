export default async function loadAndroidSdkPackages(): Promise<string[]> {
  const response = await fetch('https://dl.google.com/android/repository/repository2-3.xml', {
    headers: { 'User-Agent': 'codify-completions-cron' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Android SDK repository: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();

  // Extract path attributes from package elements and convert ; separators to /
  const paths = new Set<string>();
  const regex = /\bpath="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    // Convert legacy semicolon path separators to the android CLI forward-slash format
    paths.add(match[1].replace(/;/g, '/'));
  }

  return [...paths].sort();
}
