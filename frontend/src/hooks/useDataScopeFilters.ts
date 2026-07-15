import { useCallback, useMemo } from 'react';
import useAvailability from './useAvailability';
import type { Selection } from 'types/components';
import type { AvailabilityDataset, DatasetFrontendFilters, TimeFilterState } from 'types/availability';
import { mapFilteredDatasetSummaryToAvailabilityDataset, yearRangeToDatasetFilters } from '../adapters';
import { DATA_ACCESS_ITEMS, DATA_TYPE_ITEMS } from '../configuration/filters';

type TimeFilterRange = {
  min: number;
  max: number;
};

type DataScopeFiltersType = {
  isLoading: boolean;
  datasetFrontendFilters: DatasetFrontendFilters;
  selectedTimeFilter: TimeFilterState;
  timeFilterRange: TimeFilterRange;
  timeFilterPills: Selection[] | null;
  typeFilterOptions: Selection[];
  typeFilterPills: Selection[];
  accessFilterOptions: Selection[];
  accessFilterPills: Selection[];
  hasUnavailableScopeSelected: boolean;
  setFrontendFilters: (value: string[], name: string) => void;
  typeFilterPillRemove: (id: string) => void;
  accessFilterPillRemove: (id: string) => void;
  handleTimeFilterChange: (value: TimeFilterState) => void;
};

const useDataScopeFilters = (): DataScopeFiltersType => {
  const {
    isLoading,
    allDatasets,
    geometryFilterResults,
    selectedTimeFilter,
    datasetFrontendFilters,
    setSelectedTimeFilter,
    setFrontendFilters,
    setDatasetFilters,
  } = useAvailability();

  // Options reflect what exists in the AOI regardless of the active criteria:
  // geometryFilterResults is the criteria-free coverage, while allDatasets is
  // already narrowed by data_types/visibility and would collapse the option
  // lists to the current selection. allDatasets is only a fallback while the
  // geometry-only coverage loads.
  const optionSourceDatasets = useMemo(
    (): AvailabilityDataset[] => geometryFilterResults?.datasets.map(mapFilteredDatasetSummaryToAvailabilityDataset) ?? allDatasets,
    [geometryFilterResults, allDatasets],
  );

  const timeFilterRange = useMemo((): TimeFilterRange => {
    if (!allDatasets.length) return { min: 0, max: 0 };

    let min: number = Infinity;
    let max: number = -Infinity;

    for (const dataset of allDatasets) {
      if (dataset.properties.dateStart) {
        min = Math.min(min, dataset.properties.dateStart);
      }
      if (dataset.properties.dateEnd) {
        max = Math.max(max, dataset.properties.dateEnd);
      }
    }

    return {
      min: Number.isFinite(min) ? min : 0,
      max: Number.isFinite(max) ? max : 0,
    };
  }, [allDatasets]);

  const handleTimeFilterChange = useCallback(
    (value: TimeFilterState) => {
      setSelectedTimeFilter(value);

      setDatasetFilters(prevFilters => {
        return { ...prevFilters, ...yearRangeToDatasetFilters(value) };
      });
    },
    [setSelectedTimeFilter, setDatasetFilters],
  );

  const timeFilterPills = useMemo((): Selection[] | null => {
    if (selectedTimeFilter.max && selectedTimeFilter.min) {
      return [
        {
          id: 'time',
          label: `${selectedTimeFilter.min}-${selectedTimeFilter.max}`,
          disabled: !isLoading && (!timeFilterRange.min || !timeFilterRange.max),
        },
      ];
    }

    return null;
  }, [isLoading, selectedTimeFilter, timeFilterRange]);

  const typeFilterOptions = useMemo((): Selection[] => {
    if (!optionSourceDatasets.length) return [];
    const types: string[] = [];

    for (const dataset of optionSourceDatasets) {
      if (dataset.dataType && !types.includes(dataset.dataType)) {
        types.push(dataset.dataType);
      }
    }

    return DATA_TYPE_ITEMS.filter(item => types.includes(item.id));
  }, [optionSourceDatasets]);

  const typeFilterPills = useMemo((): Selection[] => {
    const availableOptions = typeFilterOptions.map(option => option.id);
    return DATA_TYPE_ITEMS.filter(item => datasetFrontendFilters.type.includes(item.id)).map(item => ({
      ...item,
      disabled: !isLoading && !availableOptions.includes(item.id),
    }));
  }, [isLoading, datasetFrontendFilters.type, typeFilterOptions]);

  const typeFilterPillRemove = useCallback(
    (id: string) => {
      setFrontendFilters(
        datasetFrontendFilters.type.filter(selectedId => selectedId !== id),
        'type',
      );
    },
    [datasetFrontendFilters.type, setFrontendFilters],
  );

  const accessFilterOptions = useMemo((): Selection[] => {
    if (!optionSourceDatasets.length) return [];
    const visibilityOptions: string[] = [];

    for (const dataset of optionSourceDatasets) {
      if (dataset.visibility && !visibilityOptions.includes(dataset.visibility)) {
        visibilityOptions.push(dataset.visibility);
      }
    }

    return DATA_ACCESS_ITEMS.filter(item => visibilityOptions.includes(item.id));
  }, [optionSourceDatasets]);

  const accessFilterPills = useMemo((): Selection[] => {
    return DATA_ACCESS_ITEMS.filter(item => datasetFrontendFilters.visibility.includes(item.id));
  }, [datasetFrontendFilters.visibility]);

  const accessFilterPillRemove = useCallback(
    (id: string) => {
      setFrontendFilters(
        datasetFrontendFilters.visibility.filter(selectedId => selectedId !== id),
        'visibility',
      );
    },
    [datasetFrontendFilters.visibility, setFrontendFilters],
  );

  const hasUnavailableScopeSelected = useMemo(() => {
    return [...(timeFilterPills || []), ...typeFilterPills, ...accessFilterPills].some(pill => pill.disabled);
  }, [timeFilterPills, typeFilterPills, accessFilterPills]);

  return {
    isLoading,
    datasetFrontendFilters,
    selectedTimeFilter,
    timeFilterRange,
    timeFilterPills,
    typeFilterOptions,
    typeFilterPills,
    accessFilterOptions,
    accessFilterPills,
    hasUnavailableScopeSelected,
    typeFilterPillRemove,
    accessFilterPillRemove,
    handleTimeFilterChange,
    setFrontendFilters,
  };
};

export default useDataScopeFilters;
