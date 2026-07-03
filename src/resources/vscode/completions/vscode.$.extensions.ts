export default async function loadVscodeExtensions(): Promise<string[]> {
  const body = {
    filters: [{
      criteria: [{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }],
      pageSize: 200,
      sortBy: 4,
    }],
    flags: 914,
  };

  const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json;api-version=7.2-preview.1',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json() as any;
  return data.results[0].extensions.map(
    (e: any) => `${e.publisher.publisherName}.${e.extensionName}` as string
  );
}
