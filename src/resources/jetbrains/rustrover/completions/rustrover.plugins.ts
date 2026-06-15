export default async function loadRustRoverPlugins(): Promise<string[]> {
  const response = await fetch(
    'https://plugins.jetbrains.com/api/plugins?build=RR&orderBy=downloads&offset=0&limit=500',
    { headers: { Accept: 'application/json' } }
  );

  if (!response.ok) {
    return [];
  }

  const data = await response.json() as Array<{ xmlId?: string }>;
  return data
    .map((p) => p.xmlId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}
