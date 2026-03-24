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
        setError(err);

        if (config.showErrorNotification !== false) {
          // Default: show notification
          showNotification({
            id: 'network_error',
            title: t('errors.network_error.title'),
            message: err instanceof TypeError ? t('errors.network_error.message') : err.message,
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
