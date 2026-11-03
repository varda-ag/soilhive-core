import { renderHook } from '@testing-library/react';
import { useApiMutation } from 'hooks/useApiMutation';
import {
  useCreateRasterFilterMutation,
  useUpdateRasterFilterMutation,
  useUpdateRasterFilterMappingsMutation,
  useDeleteRasterFilterMutation,
} from 'hooks/useRasterFilterMutation';

jest.mock('hooks/useApiMutation', () => ({
  useApiMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

describe('raster filter mutations', () => {
  afterEach(() => jest.clearAllMocks());

  it('useCreateRasterFilterMutation calls useApiMutation with POST /raster-filters', () => {
    renderHook(() => useCreateRasterFilterMutation());

    expect(useApiMutation).toHaveBeenCalledWith({ endpoint: '/raster-filters', method: 'POST', showErrorNotification: true });
  });

  it('useUpdateRasterFilterMutation calls useApiMutation with PATCH /raster-filters/:id', () => {
    renderHook(() => useUpdateRasterFilterMutation('land_cover'));

    expect(useApiMutation).toHaveBeenCalledWith({ endpoint: '/raster-filters/land_cover', method: 'PATCH', showErrorNotification: true });
  });

  it('useUpdateRasterFilterMappingsMutation calls useApiMutation with PUT /raster-filters/:id/mappings', () => {
    renderHook(() => useUpdateRasterFilterMappingsMutation('land_cover'));

    expect(useApiMutation).toHaveBeenCalledWith({
      endpoint: '/raster-filters/land_cover/mappings',
      method: 'PUT',
      showErrorNotification: true,
    });
  });

  it('useDeleteRasterFilterMutation calls useApiMutation with DELETE /raster-filters/:id', () => {
    renderHook(() => useDeleteRasterFilterMutation('land_cover'));

    expect(useApiMutation).toHaveBeenCalledWith({ endpoint: '/raster-filters/land_cover', method: 'DELETE', showErrorNotification: true });
  });
});
