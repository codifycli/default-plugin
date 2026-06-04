export default async function loadCursorExtensions(): Promise<string[]> {
  const results: string[] = [];
  const pageSize = 200;

  for (let offset = 0; offset < 1000; offset += pageSize) {
    const url = `https://open-vsx.org/api/-/search?size=${pageSize}&sortBy=downloadCount&sortOrder=desc&offset=${offset}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) break;

    const data = await response.json() as any;
    const extensions = data.extensions as any[] | undefined;
    if (!extensions || extensions.length === 0) break;

    results.push(...extensions.map((e: any) => `${e.namespace}.${e.name}` as string));
  }

  return results;
}
