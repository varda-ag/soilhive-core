import { useMemo } from 'react';
import useAvailability from './useAvailability';
import type { Selection } from 'components/UI/types';

// Mappings are keyed by pixel value. A value with no label shows as itself
const labelOf = (mappings: Record<string, string>, value: number): string => mappings[String(value)] ?? String(value);

export function useRasterFilters(categoryId?: string) {
  const {
    datasetFilters,
    setDatasetFilters,
    geometryFilterResults,
    allRasterCategories,
    isLoadingRasterCategories,
    isLoadingPartialFilter,
  } = useAvailability();

  // These are all the options for a given raster filter category (e.g. soil_group), regardeless of the geometry
  const currentRasterCategory = useMemo(() => {
    if (!categoryId) return undefined;
    return allRasterCategories?.find(cat => cat.id === categoryId);
  }, [allRasterCategories, categoryId]);

  // These are those raster filter options that are actually available given the current geometry. This is what will be displayed as checkboxes.
  // Several pixel values may share a label, so an option carries every value of its label
  const availableOptions = useMemo((): { label: string; values: number[] }[] => {
    if (!categoryId || !currentRasterCategory || !currentRasterCategory.mappings) return [];
    const merged = new Set<number>();
    geometryFilterResults?.raster_filters?.[categoryId]?.forEach(v => merged.add(v));

    const valuesByLabel = new Map<string, number[]>();
    for (const [value, label] of Object.entries(currentRasterCategory.mappings)) {
      valuesByLabel.set(label, [...(valuesByLabel.get(label) ?? []), Number(value)]);
    }
    return [...valuesByLabel]
      .filter(([_, values]) => values.some(value => merged.has(value)))
      .map(([label, values]) => ({ label, values }));
  }, [geometryFilterResults, categoryId, currentRasterCategory]);

  const hasNoOptions = useMemo(() => {
    if (isLoadingRasterCategories || isLoadingPartialFilter || !currentRasterCategory || !currentRasterCategory.mappings) {
      return false;
    }
    return availableOptions.length === 0;
  }, [isLoadingRasterCategories, isLoadingPartialFilter, availableOptions, currentRasterCategory]);

  // User currently selected raster filter values are inferred from the dataset filter in the Activity Context
  const selectedValues = useMemo(() => {
    if (!categoryId) return [];
    return datasetFilters.raster_filters?.[categoryId] || [];
  }, [datasetFilters.raster_filters, categoryId]);

  // This is the logic to determine which pill to render also considering that, because of the geometry, maybe it's value isn't available anymore.
  // One pill per label, whose id is the label
  const pillSelections = useMemo((): Selection[] => {
    const mappings = currentRasterCategory?.mappings; // Capture it
    if (!mappings) return []; // Narrow it
    const availableLabels = new Set(availableOptions.map(o => o.label));
    const labels = new Set(selectedValues.map(value => labelOf(mappings, value)));
    return [...labels].map(label => ({
      id: label,
      label,
      disabled: !isLoadingRasterCategories && !isLoadingPartialFilter && !availableLabels.has(label),
    }));
  }, [currentRasterCategory, selectedValues, availableOptions, isLoadingRasterCategories, isLoadingPartialFilter]);

  const hasUnavailableRasterSelected = useMemo(() => {
    return pillSelections.some(pill => pill.disabled);
  }, [pillSelections]);

  // Removes every selected value of the pill's label
  const handlePillRemove = (id: string) => {
    const mappings = currentRasterCategory?.mappings ?? {};
    handleOnChange(selectedValues.filter(v => labelOf(mappings, v) !== id));
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
    hasNoOptions,
    isLoadingPartialFilter,
    hasUnavailableRasterSelected,
    handleOnChange,
    handlePillRemove,
  };
}
