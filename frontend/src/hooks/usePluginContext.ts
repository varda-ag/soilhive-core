import { useMemo } from 'react';
import type { PluginDataset, PluginQueryResult } from 'frontend-plugin-types';
import type { PluginContext } from 'types/plugins';
import { useAuthContext } from '../auth/AuthContextProvider';
import { useDatasets } from './useDatasets';

function usePluginDatasets(): PluginQueryResult<PluginDataset[]> {
  const { datasets, isLoading, isError } = useDatasets();
  return {
    data: datasets?.map(({ id, slug, name, description }) => ({ id, slug, name, description })),
    isLoading,
    isError,
  };
}

export function usePluginContext(): PluginContext {
  const { user } = useAuthContext();
  return useMemo<PluginContext>(
    () => ({
      // Narrow explicitly rather than passing `user` through as-is: it
      // carries access_token/refresh_token/id_token, which PluginContext's
      // thin contract must not leak to plugins.
      user: user ? { profile: { name: user.profile?.name, email: user.profile?.email } } : user,
      useDatasets: usePluginDatasets,
    }),
    [user],
  );
}
