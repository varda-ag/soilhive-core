// What an Access Request may ask for on a private Dataset (see ADR 0082).
export type PluginAccessRequestCapability = 'preview' | 'download';

export interface PluginAccessRequestInput {
  // Slugs of private, published Datasets: 1 to 50, each once.
  datasets: string[];
  capabilities: PluginAccessRequestCapability[];
  // Why the access is needed, shown to admins. Up to 1000 characters.
  message?: string;
}

// 'pending' while any Dataset in it waits for a decision.
export type PluginAccessRequestStatus = 'pending' | 'finished' | 'withdrawn';

export interface PluginAccessRequest {
  id: string;
  status: PluginAccessRequestStatus;
  // ISO 8601 in UTC.
  createdAt: string;
}
