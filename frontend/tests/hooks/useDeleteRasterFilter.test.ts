import { renderHook, act } from '@testing-library/react';
import { useDeleteRasterFilter } from 'hooks/useDeleteRasterFilter';
import { useDeleteRasterFilterMutation, useUpdateRasterFilterMutation } from 'hooks/useRasterFilterMutation';
import type { RasterFilterCategory } from 'types/backend';

const mockInvalidateQueries = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

jest.mock('hooks/useRasterFilterMutation', () => ({
  useUpdateRasterFilterMutation: jest.fn(),
  useDeleteRasterFilterMutation: jest.fn(),
}));

const updateFilter = jest.fn();
const deleteFilter = jest.fn();

const makeFilter = (overrides?: Partial<RasterFilterCategory>): RasterFilterCategory => ({
  id: 'land_cover',
  name: 'Land Cover',
  description: '',
  enabled: true,
  active: false,
  mappings: null,
  created_at: '2024-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  ...overrides,
});

describe('useDeleteRasterFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateFilter.mockResolvedValue({});
    deleteFilter.mockResolvedValue(null);
    (useUpdateRasterFilterMutation as jest.Mock).mockReturnValue({ mutateAsync: updateFilter, isPending: false });
    (useDeleteRasterFilterMutation as jest.Mock).mockReturnValue({ mutateAsync: deleteFilter, isPending: false });
  });

  it('starts with no filter picked for deletion', () => {
    const { result } = renderHook(() => useDeleteRasterFilter());

    expect(result.current.filterToDelete).toBeNull();
  });

  it('picks the filter on delete and points the mutations at it', () => {
    const filter = makeFilter();
    const { result } = renderHook(() => useDeleteRasterFilter());

    act(() => result.current.onDelete(filter));

    expect(result.current.filterToDelete).toBe(filter);
    expect(useUpdateRasterFilterMutation).toHaveBeenLastCalledWith('land_cover');
    expect(useDeleteRasterFilterMutation).toHaveBeenLastCalledWith('land_cover');
  });

  it('drops the picked filter on cancel', () => {
    const { result } = renderHook(() => useDeleteRasterFilter());

    act(() => result.current.onDelete(makeFilter()));
    act(() => result.current.onDeleteCancel());

    expect(result.current.filterToDelete).toBeNull();
  });

  it('does nothing on confirm when no filter is picked', async () => {
    const { result } = renderHook(() => useDeleteRasterFilter());

    await act(() => result.current.onDeleteConfirm());

    expect(updateFilter).not.toHaveBeenCalled();
    expect(deleteFilter).not.toHaveBeenCalled();
  });

  it('deletes an inactive filter without deactivating it', async () => {
    const { result } = renderHook(() => useDeleteRasterFilter());

    act(() => result.current.onDelete(makeFilter({ active: false })));
    await act(() => result.current.onDeleteConfirm());

    expect(updateFilter).not.toHaveBeenCalled();
    expect(deleteFilter).toHaveBeenCalledTimes(1);
    expect(result.current.filterToDelete).toBeNull();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['rasterFilters'] });
  });

  it('deactivates an active filter before deleting it', async () => {
    const { result } = renderHook(() => useDeleteRasterFilter());

    act(() => result.current.onDelete(makeFilter({ active: true })));
    await act(() => result.current.onDeleteConfirm());

    expect(updateFilter).toHaveBeenCalledWith({ active: false });
    expect(deleteFilter).toHaveBeenCalledTimes(1);
    expect(updateFilter.mock.invocationCallOrder[0]).toBeLessThan(deleteFilter.mock.invocationCallOrder[0]);
  });

  it('does not delete when the deactivation fails', async () => {
    updateFilter.mockRejectedValue(new Error('409'));
    const { result } = renderHook(() => useDeleteRasterFilter());

    act(() => result.current.onDelete(makeFilter({ active: true })));
    await act(() => result.current.onDeleteConfirm());

    expect(deleteFilter).not.toHaveBeenCalled();
    expect(result.current.filterToDelete).not.toBeNull();
  });

  it('keeps the modal open but refreshes the list when the delete fails', async () => {
    deleteFilter.mockRejectedValue(new Error('409'));
    const { result } = renderHook(() => useDeleteRasterFilter());

    act(() => result.current.onDelete(makeFilter({ active: true })));
    await act(() => result.current.onDeleteConfirm());

    expect(result.current.filterToDelete).not.toBeNull();
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['rasterFilters'] });
  });

  it('ignores confirm while a deletion is pending', async () => {
    (useDeleteRasterFilterMutation as jest.Mock).mockReturnValue({ mutateAsync: deleteFilter, isPending: true });
    const { result } = renderHook(() => useDeleteRasterFilter());

    act(() => result.current.onDelete(makeFilter()));
    await act(() => result.current.onDeleteConfirm());

    expect(result.current.isDeleting).toBe(true);
    expect(deleteFilter).not.toHaveBeenCalled();
  });
});
