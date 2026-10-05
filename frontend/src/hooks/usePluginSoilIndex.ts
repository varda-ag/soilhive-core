import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PluginMutationResult, PluginSoilIndexRun, PluginSoilIndexRunResult, PluginSoilIndexSubmission } from 'frontend-plugin-types';
import { REST_END_POINTS } from 'configuration/api';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { buildPluginConfigId } from './pluginConfigId';
import { toDataRequestError } from './usePluginDataRequest';

// Soil Index Runs follow the Data Request hooks exactly (ADR 0044): same polling, same errors.
const POLL_MS = 2000;
const MAX_RETRIES = 3;

export const soilIndexQueryKey = (id: string | undefined) => ['soil-indexes', id];

const isTerminal = (run: PluginSoilIndexRun | undefined): boolean => run?.status === 'completed' || run?.status === 'failed';

const isPermanent = (error: unknown): boolean => toDataRequestError(error).kind !== 'unavailable';

export function usePluginSoilIndex(id: string | undefined): PluginSoilIndexRunResult {
  const { data, isLoading, error } = useApiQuery<PluginSoilIndexRun>({
    endpoint: `/${REST_END_POINTS.SOIL_INDEXES}/${id}`,
    method: 'GET',
    queryKey: soilIndexQueryKey(id),
    enabled: !!id,
    // A completed or failed Run never changes; polling refreshes one still in progress.
    staleTime: Infinity,
    refetchInterval: query => (isTerminal(query.state.data) || (query.state.error && isPermanent(query.state.error)) ? false : POLL_MS),
    retry: (failureCount, retryError) => !isPermanent(retryError) && failureCount < MAX_RETRIES,
    showErrorNotification: false,
  });

  return useMemo(() => {
    const runError = error ? toDataRequestError(error) : undefined;
    // An 'unavailable' error keeps the last data; a lost or forbidden one has none to keep.
    const keepsData = !runError || runError.kind === 'unavailable';
    return { data: data && keepsData ? data : undefined, isLoading, isError: !!runError, error: runError };
  }, [data, isLoading, error]);
}

export function usePluginSoilIndexSubmit(
  pluginId: string,
  configId: string,
): PluginMutationResult<PluginSoilIndexSubmission, PluginSoilIndexRun> {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending, isError } = useApiMutation<PluginSoilIndexRun, PluginSoilIndexSubmission & { config_id: string }>({
    endpoint: `/${REST_END_POINTS.SOIL_INDEXES}`,
    method: 'POST',
    showErrorNotification: false,
  });

  return useMemo(
    () => ({
      mutateAsync: async (submission: PluginSoilIndexSubmission) => {
        // Always attached, so a dashboard's viewers cannot delete its Runs.
        const created = await mutateAsync({ ...submission, config_id: buildPluginConfigId(pluginId, configId) });
        // Seeds the cache, so reading the new id shows it pending without another request.
        queryClient.setQueryData(soilIndexQueryKey(created.id), created);
        return created;
      },
      isPending,
      isError,
    }),
    [mutateAsync, isPending, isError, queryClient, pluginId, configId],
  );
}

export function usePluginSoilIndexDelete(): PluginMutationResult<{ id: string }, void> {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending, isError } = useApiMutation<void, { id: string }>({
    endpoint: ({ id }) => `/${REST_END_POINTS.SOIL_INDEXES}/${id}`,
    method: 'DELETE',
    showErrorNotification: false,
    // Already gone counts as deleted, so a plugin can repeat a delete safely.
    notFoundAsNull: true,
  });

  return useMemo(
    () => ({
      mutateAsync: async ({ id }: { id: string }) => {
        await mutateAsync({ id });
        // Any widget still reading this id refetches and reads it as lost; its tiles are gone too.
        await queryClient.invalidateQueries({ queryKey: soilIndexQueryKey(id) });
        await queryClient.invalidateQueries({ queryKey: ['soil-index-tiles', id] });
      },
      isPending,
      isError,
    }),
    [mutateAsync, isPending, isError, queryClient],
  );
}
