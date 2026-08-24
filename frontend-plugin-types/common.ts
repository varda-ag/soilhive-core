export interface PluginUser {
  profile?: {
    name?: string;
    email?: string;
  };
}

export interface PluginQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

export interface PluginConfigResult<T> {
  config: T | undefined;
  isLoading: boolean;
  isError: boolean;
  saveConfig: (config: T) => Promise<void>;
}
