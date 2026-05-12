import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { httpClient } from './httpClient';
import { type APIRequestConfig } from './types/api';
import useNotifications from 'hooks/useNotifications';

export function useRequest<T = any>() {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { showNotification } = useNotifications();

  const request = useCallback(
    async (config: APIRequestConfig): Promise<T | null> => {
      try {
        setLoading(true);
        setError(null);
        const data = await httpClient<T>(config);
        return data;
      } catch (err: any) {
        if (config.ignoreAbortError && err.name === 'AbortError') {
          return null;
        }

        setError(err);

        if (config.showErrorNotification !== false) {
          // Default: show notification
          const message = err instanceof TypeError ? t('errors.network_error.message') : err.message;
          const isTimeout = message.toLowerCase().includes('timeout');
          const type = isTimeout ? 'warning' : 'error';
          showNotification({
            id: 'network_error',
            type,
            title: isTimeout ? t('errors.timeout_error.title') : t('errors.network_error.title'),
            message: isTimeout ? t('errors.timeout_error.message') : message,
          });
        }

        if (config.notFoundAsNull && err.status === 404) {
          return null;
        }

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [showNotification, t],
  );

  return { request, loading, error };
}
