import { useMemo } from 'react';
import useAvailability from './useAvailability';
import { useRasterFilters } from './useRasterFilters';

export const useRasterFilterState = (categoryId: 'agroecological_zones' | 'land_cover' | 'soil_groups') => {
  const { data: allCategories, isLoading } = useRasterFilters();
  const { datasetFilters, setDatasetFilters } = useAvailability();

  // Get current selections from the global filter object
  const selectedValues = useMemo(() => {
    const rasterMap = datasetFilters.raster_filters;
    return rasterMap?.get(categoryId) || [];
  }, [datasetFilters.raster_filters, categoryId]);

  // Find the specific category metadata
  const categoryData = useMemo(() => {
    return allCategories?.find(cat => cat.id === categoryId);
  }, [allCategories, categoryId]);

  const handleOnChange = (nextValues: number[]) => {
    setDatasetFilters(prev => {
      // Create a new Map from the existing one to ensure reference change
      const newMap = new Map(prev.raster_filters || []);

      if (nextValues.length > 0) {
        newMap.set(categoryId, nextValues);
      } else {
        newMap.delete(categoryId);
      }

      return {
        ...prev,
        raster_filters: newMap.size > 0 ? newMap : undefined,
      };
    });
  };

  return {
    categoryData,
    isLoading,
    selectedValues,
    handleOnChange,
  };
};
