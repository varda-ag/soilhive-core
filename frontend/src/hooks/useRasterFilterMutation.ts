import type { RasterFilter } from 'types/backend';
import { useApiMutation } from './useApiMutation';

export type RasterFilterCreatePayload = { name: string; description: string; file_id: string; band?: number; kind: 'categorical' };
export type RasterFilterPatchPayload = { name?: string; description?: string; active?: boolean };

export function useCreateRasterFilterMutation() {
  return useApiMutation<RasterFilter, RasterFilterCreatePayload>({
    endpoint: '/raster-filters',
    method: 'POST',
    showErrorNotification: true,
  });
}

// The id is not part of the variables: they are sent as the body
export function useUpdateRasterFilterMutation(id: string | null | undefined) {
  return useApiMutation<RasterFilter, RasterFilterPatchPayload>({
    endpoint: `/raster-filters/${id}`,
    method: 'PATCH',
    showErrorNotification: true,
  });
}

// Pixel value → label; an empty object removes every label
export function useUpdateRasterFilterMappingsMutation(id: string | null | undefined) {
  return useApiMutation<RasterFilter, Record<string, string>>({
    endpoint: `/raster-filters/${id}/mappings`,
    method: 'PUT',
    showErrorNotification: true,
  });
}

// Refused while the filter is active or its install is unfinished
export function useDeleteRasterFilterMutation(id: string | null | undefined) {
  return useApiMutation<null>({
    endpoint: `/raster-filters/${id}`,
    method: 'DELETE',
    showErrorNotification: true,
  });
}
