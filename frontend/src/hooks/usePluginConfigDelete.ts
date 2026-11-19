import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PluginConfigError, PluginMutationResult } from 'frontend-plugin-types';
import { useRequest } from '../api-client';
import { BACKEND_BASE_URL } from '../configuration/api';
import { buildPluginConfigId } from './pluginConfigId';

// The DELETE is a Leave, or a Delete for an admin or the last holder (ADR 0083). 404 and 403 leave
// nothing this caller can leave: the item is gone, or they hold no grant on it. They resolve inside
// mutationFn so isError stays false.
const usePluginConfigDelete = (pluginId: string): PluginMutationResult<{ id: string }, void> => {
  const queryClient = useQueryClient();
  const { request } = useRequest();
  const { mutateAsync, isPending, isError } = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const configId = buildPluginConfigId(pluginId, id);
      try {
        await request({ url: `${BACKEND_BASE_URL}/configs/${configId}`, method: 'DELETE', showErrorNotification: false });
      } catch (error) {
        const { status, raw } = (error ?? {}) as { status?: number; raw?: unknown };
        if (status === 409) {
          // Reached only through everyone's grant: the plugin explains why it stays
          throw { status, body: raw } satisfies PluginConfigError;
        }
        if (status !== 403 && status !== 404) {
          throw error;
        }
      }
      // Resolves only once every listing has dropped the item.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
        queryClient.invalidateQueries({ queryKey: ['/configs'] }),
        queryClient.invalidateQueries({ queryKey: [`/configs/${configId}`] }),
        // Reset, not invalidated: the refetch of a deleted item's grants fails (403), and a failed
        // refetch keeps the old data, so an open sharing panel would go on showing the old grants.
        queryClient.resetQueries({ queryKey: ['config-entitlements', configId] }),
      ]);
    },
  });

  return useMemo(() => ({ mutateAsync, isPending, isError }), [mutateAsync, isPending, isError]);
};

export default usePluginConfigDelete;
