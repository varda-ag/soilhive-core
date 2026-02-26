import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import useAvailability from './useAvailability';
import type { RasterFilterCategory } from '../types/backend';
import { type Selection } from '../types/components';
import { BACKEND_BASE_URL } from '../utilities/environmentVariables';
import { useRequest } from '../api-client';
import useNotifications from 'hooks/useNotifications';

// Mock data until endpoint is ready
/*const MOCK_RASTER_FILTERS: RasterFilterCategory[] = [
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
];*/

export function useRasterFilters(categoryId?: 'agroecological_zones' | 'land_cover' | 'soil_groups') {
  const { datasetFilters, setDatasetFilters, geometryFilterResults } = useAvailability();

  const { request } = useRequest<RasterFilterCategory[]>();

  const { showNotification } = useNotifications();

  // Load all raster filters (regardless of category)
  const {
    data: allCategories,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['rasterFilters'],
    queryFn: () =>
      request({
        url: `${BACKEND_BASE_URL}/raster-filters`,
        method: 'GET',
      }),
    /*queryFn: async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      return MOCK_RASTER_FILTERS;
    }*/
  });

  useEffect(() => {
    if (!error) return;
    showNotification({
      id: 'raster-filters-error',
      title: 'Failed to load raster filters',
      type: 'error',
    });
  }, [error, showNotification]);

  // These are all the options for a given raster filter category (e.g. soil_group), regardeless of the geometry
  const categoryData = useMemo(() => {
    if (!categoryId) return undefined;
    return allCategories?.find(cat => cat.id === categoryId);
  }, [allCategories, categoryId]);

  // These are those raster filter options that are actually available given the current geometry. This is what will be displayed as checkboxes
  const availableOptions = useMemo((): { label: string; value: number }[] => {
    if (!categoryId || !categoryData) return [];
    const merged = new Set<number>();
    geometryFilterResults?.forEach(dataset => {
      dataset.raster_filters?.[categoryId]?.forEach(v => merged.add(v));
    });
    // TODO: remove when backend returns raster_filters — fall back to all options
    const hasMergedValues = merged.size > 0;
    return (
      Object.entries(categoryData.mapping)
        .filter(([_, value]) => (hasMergedValues ? merged.has(value) : true)) // TODO: remove when backend returns raster_filters
        //.filter(([_, value]) => merged.has(value))
        .map(([label, value]) => ({ label, value }))
    );
  }, [geometryFilterResults, categoryId, categoryData]);

  // User currently selected raster filter values are inferred from the dataset filter in the Activity Context
  const selectedValues = useMemo(() => {
    if (!categoryId) return [];
    return datasetFilters.raster_filters?.[categoryId] || [];
  }, [datasetFilters.raster_filters, categoryId]);

  // This is the logic to determine which pill to render also considering that, because of the geometry, maybe it's value isn't available anymore
  const pillSelections = useMemo((): Selection[] => {
    if (!categoryData) return [];
    const availableValues = availableOptions.map(o => o.value);
    return selectedValues.map(value => {
      const label = Object.keys(categoryData.mapping).find(key => categoryData.mapping[key] === value) ?? String(value);
      return {
        id: String(value),
        label,
        disabled: !isLoading && !availableValues.includes(value),
      };
    });
  }, [categoryData, selectedValues, availableOptions, isLoading]);

  const handlePillRemove = (id: string) => {
    handleOnChange(selectedValues.filter(v => String(v) !== id));
  };

  // user selction is stored in the dataset filter of the AvailabilityCOntext
  const handleOnChange = (nextValues: number[]) => {
    if (!categoryId) return;

    setDatasetFilters(prev => {
      const newFilters = { ...prev.raster_filters };

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
    categoryData,
    isLoading,
    selectedValues,
    availableOptions,
    pillSelections,
    handleOnChange,
    handlePillRemove,
  };
}
