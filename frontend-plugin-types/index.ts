export interface PluginUser {
  profile?: {
    name?: string;
    email?: string;
  };
}

export interface PluginContext {
  user?: PluginUser | null;
}
