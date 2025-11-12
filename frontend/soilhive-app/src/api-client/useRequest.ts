import { useState, useCallback } from 'react';
import { httpClient } from './httpClient';
import { APIRequestConfig } from './types/api';

export function useRequest<T = any>() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const request = useCallback(async (config: APIRequestConfig): Promise<T> => {
    try {
      setLoading(true);
      setError(null);
      const data = await httpClient<T>(config);
      return data;
    } catch (err: any) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { request, loading, error };
}
