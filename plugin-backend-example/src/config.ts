export interface Config {
  pluginId: string;
  // The core's CORE_PUBLIC_URL: every Plugin token's iss must equal it
  coreUrl: string;
  // Where this backend reaches the core, for the keys and for reads: an in-cluster address, say.
  // A gateway in front of the core's public address may not accept Plugin tokens
  coreInternalUrl: string;
  port: number;
  staticDir?: string;
}

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

export const readConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const required = (name: string): string => {
    const value = env[name];
    if (!value) {
      throw new Error(`${name} is required`);
    }
    return value;
  };
  const coreUrl = withoutTrailingSlash(required('SOILHIVE_CORE_URL'));
  return {
    pluginId: required('PLUGIN_ID'),
    coreUrl,
    coreInternalUrl: withoutTrailingSlash(env.SOILHIVE_CORE_INTERNAL_URL || coreUrl),
    port: Number(env.PORT || 8080),
    staticDir: env.STATIC_DIR || undefined,
  };
};
