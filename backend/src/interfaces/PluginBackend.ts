// A Plugin Backend this deployment forwards /plugins/{pluginId}/ to (docs/adr/0062).
export interface PluginBackend {
  url: URL; // its base URL; the pathname always ends in '/'
  secret: string; // sent as its bearer token, so it can tell a call from the core backend from any other
}
