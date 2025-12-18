import { useFetchFilteredDatasets } from 'hooks/useFetchFilteredDatasets';
import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';
import type { AvailabilityDataset } from 'types/availability';
import { mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import type { DatasetFilter } from 'types/backend';

type DatasetFilters = {
  type: string[];
  ownership: string;
};

type DatasetsSummary = {
  count: number;
  dataPoints: number;
  layers: number;
  depth: string;
  date: string;
};

type AvailabilityContextType = {
  datasets: AvailabilityDataset[];
  selectedDatasets: string[];
  isAllSelected: boolean;
  searchValue: string;
  selectedFilters: DatasetFilters;
  datasetsSummary: DatasetsSummary;
  selectDataset: (id: string) => void;
  setSearchValue: (value: string) => void;
  setFilters: (value: string | string[], name: string) => void;
  selectAllDatasets: (select: boolean) => void;
  setDatasetFilters: (filter: DatasetFilter) => void;
};

export const AvailabilityContext = createContext<AvailabilityContextType | undefined>(undefined);

type AvailabilityProviderProps = {
  children: ReactNode;
};

export const AvailabilityProvider: React.FC<AvailabilityProviderProps> = ({ children }) => {
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedFilters, setSelectedFilters] = useState<DatasetFilters>({
    type: [],
    ownership: '',
  });
  const [isAllSelected, setIsAllSelected] = useState<boolean>(false);

  const initialFilters = {
    geometries: [],
    parameters: {},
  };
  const [datasetFilters, setDatasetFilters] = useState<DatasetFilter>(initialFilters);
  const { fetchedFilteredResults } = useFetchFilteredDatasets(datasetFilters, false);

  const selectDataset = useCallback(
    (id: string) => {
      const newValue = selectedDatasets.includes(id) ? selectedDatasets.filter(selectedId => selectedId !== id) : [...selectedDatasets, id];

      setSelectedDatasets(newValue);
      setIsAllSelected(false);
    },
    [selectedDatasets],
  );

  const setFilters = useCallback(
    (value: string | string[], name?: string) => {
      if (!name) return;

      setSelectedFilters({
        ...selectedFilters,
        [name]: value,
      });
    },
    [selectedFilters],
  );

  const selectAllDatasets = useCallback(
    (select: boolean) => {
      setSelectedDatasets(
        select && fetchedFilteredResults?.results
          ? fetchedFilteredResults?.results?.flatMap(result => result.datasets.map(dataset => dataset.id))
          : [],
      );
      setIsAllSelected(select);
    },
    [fetchedFilteredResults],
  );

  const datasets = useMemo(() => {
    if (!fetchedFilteredResults || !fetchedFilteredResults.results) return [];

    return fetchedFilteredResults.results.flatMap(res => res.datasets.map(mapFilteredDatasetToAvailabilityDataset));
  }, [fetchedFilteredResults]);

  const datasetsSummary = useMemo(() => {
    let globalDataPoints = 0;
    const globalLayers = 0;
    let globalMinDepth: number | null = null;
    let globalMaxDepth: number | null = null;
    let globalDateStart: string | null = null;
    let globalDateEnd: string | null = null;
    let count = 0;

    if (fetchedFilteredResults && fetchedFilteredResults?.results) {
      for (const result of fetchedFilteredResults.results) {
        for (const dataset of result.datasets) {
          count++;
          globalDataPoints += dataset.dataset_layer_count;

          if (dataset.min_depth !== undefined) {
            globalMinDepth = globalMinDepth === null ? dataset.min_depth : Math.min(globalMinDepth, dataset.min_depth);
          }

          if (dataset.max_depth !== undefined) {
            globalMaxDepth = globalMaxDepth === null ? dataset.max_depth : Math.max(globalMaxDepth, dataset.max_depth);
          }

          if (dataset.min_sampling_date !== undefined) {
            if (globalDateStart === null) {
              globalDateStart = dataset.min_sampling_date;
            } else if (dataset.min_sampling_date < globalDateStart) {
              globalDateStart = dataset.min_sampling_date;
            }
          }

          if (dataset.max_sampling_date !== undefined) {
            if (globalDateEnd === null) {
              globalDateEnd = dataset.max_sampling_date;
            } else if (dataset.max_sampling_date > globalDateEnd) {
              globalDateEnd = dataset.max_sampling_date;
            }
          }
        }
      }
    }

    const depth = globalMinDepth !== null && globalMaxDepth !== null ? `${globalMinDepth}-${globalMaxDepth}` : 'N/A';
    const date = globalDateStart !== null && globalDateEnd !== null ? `${globalDateStart}-${globalDateEnd}` : 'N/A';

    return {
      count,
      dataPoints: globalDataPoints,
      layers: globalLayers,
      depth,
      date,
    };
  }, [fetchedFilteredResults]);

  return (
    <AvailabilityContext.Provider
      value={{
        datasets,
        selectedDatasets,
        isAllSelected,
        searchValue,
        selectedFilters,
        datasetsSummary,
        selectDataset,
        setSearchValue,
        setFilters,
        selectAllDatasets,
        setDatasetFilters,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
