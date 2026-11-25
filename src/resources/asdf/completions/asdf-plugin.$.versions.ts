// Available versions depend on the plugin, so only the generic keyword can be suggested here.
// "latest" is a keyword supported by the asdf-plugin resource (resolved with `asdf latest <plugin>`).
export default async function loadAsdfPluginVersions(): Promise<string[]> {
  return ['latest']
}
