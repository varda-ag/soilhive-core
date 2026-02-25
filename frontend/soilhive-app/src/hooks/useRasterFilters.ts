import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAvailability from './useAvailability';
import type { RasterFilterCategory } from '../types/backend';

// Mock data until endpoint is ready
const MOCK_RASTER_FILTERS: RasterFilterCategory[] = [
  {
    id: 'agroecological_zones',
    name: 'Agroecological Zones',
    description: 'Zones defined by climate, soil and landform',
    enabled: true,
    mapping: { Tropical: 1, Arid: 2, Temperate: 3, Boreal: 4 },
  },
  {
    id: 'land_cover',
    name: 'Land cover',
    description: 'Physical material at the surface of the earth',
    enabled: true,
    mapping: { Forest: 1, Grassland: 2, Cropland: 3, Wetland: 4 },
  },
  {
    id: 'soil_groups',
    name: 'Soil Groups',
    description: 'World Reference Base for Soil Resources',
    enabled: true,
    mapping: { Acrisols: 1, Ferralsols: 2, Gleysols: 3, Leptosols: 4 },
  },
];

export function useRasterFilters(categoryId?: 'agroecological_zones' | 'land_cover' | 'soil_groups') {
  const { datasetFilters, setDatasetFilters } = useAvailability();

  // 1. Fetching Logic
  const { data: allCategories, isLoading } = useQuery({
    queryKey: ['rasterFilters'],
    queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return MOCK_RASTER_FILTERS;
    },
  });

  // 2. State Selection Logic (Only if categoryId is provided)
  const selectedValues = useMemo(() => {
    if (!categoryId) return [];
    return datasetFilters.raster_filters?.[categoryId] || [];
  }, [datasetFilters.raster_filters, categoryId]);

  const categoryData = useMemo(() => {
    if (!categoryId) return undefined;
    return allCategories?.find(cat => cat.id === categoryId);
  }, [allCategories, categoryId]);

  // 3. Update Logic
  const handleOnChange = (nextValues: number[]) => {
    if (!categoryId) return;

    setDatasetFilters(prev => {
      const currentRasterFilters = prev.raster_filters as Record<string, number[]> | undefined;
      const newFilters = { ...currentRasterFilters };

      if (nextValues.length > 0) {
        newFilters[categoryId] = nextValues;
      } else {
        delete newFilters[categoryId];
      }

      return {
        ...prev,
        raster_filters: Object.keys(newFilters).length > 0 ? newFilters : undefined,
      };
    });
  };

  return {
    allCategories, // Useful for the general Land & Ecosystem block
    categoryData, // Specific to the requested ID
    isLoading,
    selectedValues,
    handleOnChange,
  };
}
