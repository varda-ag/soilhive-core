import { useApiQuery } from './useApiQuery';

export interface PublicStorageConfig {
  storageMode: string;
  maxUploadSizeMB: number;
}

export function useStorageConfig() {
  const {
    data: storageConfig,
    isLoading,
    isError,
  } = useApiQuery<PublicStorageConfig>({
    endpoint: '/storage/config',
    method: 'GET',
    queryKey: ['/storage/config'],
    enabled: true,
    authenticate: false,
  });

  return { storageConfig, isLoading, isError };
}
