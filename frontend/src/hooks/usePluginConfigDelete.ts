import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PluginMutationResult } from 'frontend-plugin-types';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import { buildPluginConfigId } from './pluginConfigId';

// 404 and 403 leave nothing this caller can delete: the item is gone (its grants go with it, see
// ADR 0037) or was never theirs. They resolve inside mutationFn so isError stays false.
const usePluginConfigDelete = (pluginId: string): PluginMutationResult<{ id: string }, void> => {
  const queryClient = useQueryClient();
  const { request } = useRequest();
  const { mutateAsync, isPending, isError } = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const configId = buildPluginConfigId(pluginId, id);
      try {
        await request({ url: `${BACKEND_BASE_URL}/configs/${configId}`, method: 'DELETE', showErrorNotification: false });
      } catch (error) {
        const { status } = (error ?? {}) as { status?: number };
        if (status !== 403 && status !== 404) {
          throw error;
        }
      }
      // Resolves only once every listing has dropped the item.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
        queryClient.invalidateQueries({ queryKey: ['/configs'] }),
        queryClient.invalidateQueries({ queryKey: [`/configs/${configId}`] }),
      ]);
    },
  });

  return useMemo(() => ({ mutateAsync, isPending, isError }), [mutateAsync, isPending, isError]);
};

export default usePluginConfigDelete;
