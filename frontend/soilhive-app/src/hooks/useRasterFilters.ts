import { useMemo } from 'react';
import useAvailability from './useAvailability';
import { type Selection } from '../types/components';

export function useRasterFilters(categoryId?: string) {
  const { datasetFilters, setDatasetFilters, geometryFilterResults, allRasterCategories, isLoadingRasterCategories } = useAvailability();

  // These are all the options for a given raster filter category (e.g. soil_group), regardeless of the geometry
  const currentRasterCategory = useMemo(() => {
    if (!categoryId) return undefined;
    return allRasterCategories?.find(cat => cat.id === categoryId);
  }, [allRasterCategories, categoryId]);

  // These are those raster filter options that are actually available given the current geometry. This is what will be displayed as checkboxes
  const availableOptions = useMemo((): { label: string; value: number }[] => {
    if (!categoryId || !currentRasterCategory || !currentRasterCategory.mapping) return [];
    const merged = new Set<number>();
    geometryFilterResults?.forEach(dataset => {
      dataset.raster_filters?.[categoryId]?.forEach(v => merged.add(v));
    });
    // TODO: remove when backend returns raster_filters — fall back to all options
    const hasMergedValues = merged.size > 0;
    return (
      Object.entries(currentRasterCategory.mapping)
        .filter(([_, value]) => (hasMergedValues ? merged.has(value) : true)) // TODO: remove when backend returns raster_filters
        //.filter(([_, value]) => merged.has(value))
        .map(([label, value]) => ({ label, value }))
    );
  }, [geometryFilterResults, categoryId, currentRasterCategory]);

  // User currently selected raster filter values are inferred from the dataset filter in the Activity Context
  const selectedValues = useMemo(() => {
    if (!categoryId) return [];
    return datasetFilters.raster_filters?.[categoryId] || [];
  }, [datasetFilters.raster_filters, categoryId]);

  // This is the logic to determine which pill to render also considering that, because of the geometry, maybe it's value isn't available anymore
  const pillSelections = useMemo((): Selection[] => {
    if (!currentRasterCategory) return [];
    const availableValues = availableOptions.map(o => o.value);
    return selectedValues.map(value => {
      const label = Object.keys(currentRasterCategory.mapping).find(key => currentRasterCategory.mapping[key] === value) ?? String(value);
      return {
        id: String(value),
        label,
        disabled: !isLoadingRasterCategories && !availableValues.includes(value),
      };
    });
  }, [currentRasterCategory, selectedValues, availableOptions, isLoadingRasterCategories]);

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
    category: currentRasterCategory,
    isLoadingRasterCategories,
    selectedValues,
    availableOptions,
    pillSelections,
    handleOnChange,
    handlePillRemove,
  };
}
