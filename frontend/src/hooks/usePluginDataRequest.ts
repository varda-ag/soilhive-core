import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  PluginDataRequest,
  PluginDataRequestError,
  PluginDataRequestResult,
  PluginDataRequestSubmission,
  PluginMutationResult,
} from 'frontend-plugin-types';
import { REST_END_POINTS } from 'configuration/api';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { buildPluginConfigId } from './pluginConfigId';

const POLL_MS = 2000;
const MAX_RETRIES = 3;

export const dataRequestQueryKey = (id: string | undefined) => ['data-requests', id];

// The backend's shape: statistics_type only inside `request`.
type DataRequestResponse = Omit<PluginDataRequest, 'statistics_type'>;

// TypeScript does not narrow a union through a nested property, so statistics_type is copied up
// for plugins to narrow `data` on.
const toPluginDataRequest = (response: DataRequestResponse): PluginDataRequest =>
  ({ ...response, statistics_type: response.request.statistics_type }) as PluginDataRequest;

const isTerminal = (response: DataRequestResponse | undefined): boolean =>
  response?.status === 'completed' || response?.status === 'failed';

// 401 counts as forbidden: a token the backend rejected does not become valid by retrying.
export const toDataRequestError = (error: unknown): PluginDataRequestError => {
  const { status, message } = (error ?? {}) as { status?: number; message?: string };
  const kind = status === 404 ? 'lost' : status === 401 || status === 403 ? 'forbidden' : 'unavailable';
  return { kind, message: message ?? 'Unknown error' };
};

const isPermanent = (error: unknown): boolean => toDataRequestError(error).kind !== 'unavailable';

export function usePluginDataRequest(id: string | undefined): PluginDataRequestResult {
  const { data, isLoading, error } = useApiQuery<DataRequestResponse>({
    endpoint: `/${REST_END_POINTS.DATA_REQUESTS}/${id}`,
    method: 'GET',
    queryKey: dataRequestQueryKey(id),
    enabled: !!id,
    // A completed or failed Data Request never changes; polling refreshes one still in progress.
    staleTime: Infinity,
    refetchInterval: query => (isTerminal(query.state.data) || (query.state.error && isPermanent(query.state.error)) ? false : POLL_MS),
    retry: (failureCount, retryError) => !isPermanent(retryError) && failureCount < MAX_RETRIES,
    showErrorNotification: false,
  });

  return useMemo(() => {
    const dataRequestError = error ? toDataRequestError(error) : undefined;
    // An 'unavailable' error keeps the last data; a lost or forbidden one has none to keep.
    const keepsData = !dataRequestError || dataRequestError.kind === 'unavailable';
    return {
      data: data && keepsData ? toPluginDataRequest(data) : undefined,
      isLoading,
      isError: !!dataRequestError,
      error: dataRequestError,
    };
  }, [data, isLoading, error]);
}

export function usePluginDataRequestSubmit(
  pluginId: string,
  configId: string,
): PluginMutationResult<PluginDataRequestSubmission, PluginDataRequest> {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending, isError } = useApiMutation<DataRequestResponse, PluginDataRequestSubmission & { config_id: string }>({
    endpoint: `/${REST_END_POINTS.DATA_REQUESTS}`,
    method: 'POST',
    showErrorNotification: false,
  });

  return useMemo(
    () => ({
      mutateAsync: async (submission: PluginDataRequestSubmission) => {
        const created = await mutateAsync({ ...submission, config_id: buildPluginConfigId(pluginId, configId) });
        // Seeds the cache, so reading the new id shows it pending without another request.
        queryClient.setQueryData(dataRequestQueryKey(created.id), created);
        return toPluginDataRequest(created);
      },
      isPending,
      isError,
    }),
    [mutateAsync, isPending, isError, queryClient, pluginId, configId],
  );
}

export function usePluginDataRequestDelete(): PluginMutationResult<{ id: string }, void> {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending, isError } = useApiMutation<void, { id: string }>({
    endpoint: ({ id }) => `/${REST_END_POINTS.DATA_REQUESTS}/${id}`,
    method: 'DELETE',
    showErrorNotification: false,
  });

  return useMemo(
    () => ({
      mutateAsync: async ({ id }: { id: string }) => {
        await mutateAsync({ id });
        // Any widget still reading this id refetches and reads it as lost.
        await queryClient.invalidateQueries({ queryKey: dataRequestQueryKey(id) });
      },
      isPending,
      isError,
    }),
    [mutateAsync, isPending, isError, queryClient],
  );
}
