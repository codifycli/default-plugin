import { AndroidStudioVersionData } from '../types.js';

export default async function loadAndroidStudioVersions(): Promise<string[]> {
  const response = await fetch('https://jb.gg/android-studio-releases-list.json');

  if (!response.ok) {
    throw new Error(`Failed to fetch Android Studio releases: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as { content: { item: AndroidStudioVersionData[] } };

  return data.content.item
    .filter((item) => item.channel === 'Release')
    .map((item) => item.version);
}
