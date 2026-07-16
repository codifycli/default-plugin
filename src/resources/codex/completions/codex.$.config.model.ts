const MODELS_JSON_URL = 'https://raw.githubusercontent.com/openai/codex/main/codex-rs/models-manager/models.json';

export default async function loadCodexModels(): Promise<string[]> {
  const response = await fetch(MODELS_JSON_URL);
  const data = await response.json() as { models: { slug: string }[] };
  return data.models.map((m) => m.slug);
}
