import { useCallback, useMemo } from 'react';
import useAvailability from './useAvailability';
import type { Selection } from 'types/components';
import type { DatasetFrontendFilters, TimeFilterState } from 'types/availability';
import { yearRangeToDatasetFilters } from '../adapters';
import { DATA_ACCESS_ITEMS, DATA_TYPE_ITEMS } from '../configuration/filters';

type TimeFilterRange = {
  min: number;
  max: number;
};

type DataScopeFiltresType = {
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

  isDataAccessHidden: boolean;
};

const useDataScopeFilters = (): DataScopeFiltresType => {
  const {
    isLoading,
    allDatasets,
    selectedTimeFilter,
    datasetFrontendFilters,
    setSelectedTimeFilter,
    setFrontendFilters,
    setDatasetFilters,
  } = useAvailability();

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
    if (!allDatasets.length) return [];
    const types: string[] = [];

    for (const dataset of allDatasets) {
      if (dataset.dataType && !types.includes(dataset.dataType)) {
        types.push(dataset.dataType);
      }
    }

    return DATA_TYPE_ITEMS.filter(item => types.includes(item.id));
  }, [allDatasets]);

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

  const accessFilterPills = useMemo((): Selection[] => {
    return DATA_ACCESS_ITEMS.filter(item => datasetFrontendFilters.ownership.includes(item.id));
  }, [datasetFrontendFilters.ownership]);

  const accessFilterPillRemove = useCallback(
    (id: string) => {
      setFrontendFilters(
        datasetFrontendFilters.ownership.filter(selectedId => selectedId !== id),
        'ownership',
      );
    },
    [datasetFrontendFilters.ownership, setFrontendFilters],
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
    accessFilterOptions: DATA_ACCESS_ITEMS,
    accessFilterPills,
    hasUnavailableScopeSelected,
    typeFilterPillRemove,
    accessFilterPillRemove,
    handleTimeFilterChange,
    setFrontendFilters,

    isDataAccessHidden: true,
  };
};

export default useDataScopeFilters;
