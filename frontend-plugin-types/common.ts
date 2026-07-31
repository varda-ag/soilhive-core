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
