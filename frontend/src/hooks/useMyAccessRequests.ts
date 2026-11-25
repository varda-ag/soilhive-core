import { useMemo } from 'react';
import type { PluginOwnAccessRequest, PluginQueryResult } from 'frontend-plugin-types';
import type { AccessRequestOwn } from 'types/backend';
import { useApiQuery } from './useApiQuery';

export const MY_ACCESS_REQUESTS_QUERY_KEY = ['access-requests', 'mine'];

// The signed-in user's own Access Requests (see ADR 0082), so a plugin knows which Datasets are
// already asked for. No toast: a plugin that can't read them falls back to the 409 of a request.
// Read again each time a component starts using it, since an admin may have decided meanwhile, and
// loading until then: a list cached from before must not show for a moment.
export function useMyAccessRequests(): PluginQueryResult<PluginOwnAccessRequest[]> {
  const { data, isLoading, isFetchedAfterMount, isError, refetch } = useApiQuery<AccessRequestOwn[]>({
    endpoint: '/access-requests/mine',
    method: 'GET',
    queryKey: MY_ACCESS_REQUESTS_QUERY_KEY,
    enabled: true,
    showErrorNotification: false,
    disableCache: true,
  });

  const requests = useMemo(
    () =>
      data?.map(request => ({
        id: request.id,
        status: request.status,
        createdAt: request.created_at,
        items: request.items.map(item => ({ dataset: { slug: item.dataset.slug, name: item.dataset.name }, status: item.status })),
      })),
    [data],
  );

  return { data: requests, isLoading: isLoading || !isFetchedAfterMount, isError, refetch };
}
