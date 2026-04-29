export interface APIRequestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  signal?: AbortSignal;
  isBlobResponse?: boolean;
  showErrorNotification?: boolean;
  notFoundAsNull?: boolean;
  ignoreAbortError?: boolean;
}
