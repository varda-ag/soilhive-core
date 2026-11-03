import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RasterFilterCategory } from 'types/backend';
import { useDeleteRasterFilterMutation, useUpdateRasterFilterMutation } from './useRasterFilterMutation';

export function useDeleteRasterFilter() {
  const queryClient = useQueryClient();
  const [filterToDelete, setFilterToDelete] = useState<RasterFilterCategory | null>(null);

  const { mutateAsync: updateFilter, isPending: isDeactivating } = useUpdateRasterFilterMutation(filterToDelete?.id);
  const { mutateAsync: deleteFilter, isPending: isDeletePending } = useDeleteRasterFilterMutation(filterToDelete?.id);
  const isDeleting = isDeactivating || isDeletePending;

  const onDelete = useCallback((filter: RasterFilterCategory) => setFilterToDelete(filter), []);
  const onDeleteCancel = useCallback(() => setFilterToDelete(null), []);

  const onDeleteConfirm = useCallback(async () => {
    if (!filterToDelete || isDeleting) return;
    try {
      // The backend refuses to delete an active filter
      if (filterToDelete.active) await updateFilter({ active: false });
      await deleteFilter();
      setFilterToDelete(null);
    } catch {
      // Already notified
    } finally {
      // A deactivation that went through shows in the list even when the delete failed
      await queryClient.invalidateQueries({ queryKey: ['rasterFilters'] });
    }
  }, [filterToDelete, isDeleting, updateFilter, deleteFilter, queryClient]);

  return { filterToDelete, isDeleting, onDelete, onDeleteCancel, onDeleteConfirm };
}
