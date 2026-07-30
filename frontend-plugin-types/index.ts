export interface PluginUser {
  profile?: {
    name?: string;
    email?: string;
  };
}

export interface PluginDataset {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

export interface PluginQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
}

export interface PluginContext {
  user?: PluginUser | null;
  useDatasets?: () => PluginQueryResult<PluginDataset[]>;
}
