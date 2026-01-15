import { useFetchFilteredDatasets } from 'hooks/useFetchFilteredDatasets';
import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';
import type { AvailabilityDataset, DatasetSummary } from 'types/availability';
import { mapFilteredDatasetToAvailabilityDataset } from '../adapters';
import type { FilterableDatasetMetadata } from 'types/backend';
import { computeDatasetSummary } from '../domain';
import type { MultiPolygon, Polygon } from 'geojson';

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
  preview: boolean;
  selectDataset: (id: string) => void;
  setSearchValue: (value: string) => void;
  setFilters: (value: string | string[], name: string) => void;
  selectAllDatasets: (select: boolean) => void;
  setGeometryFilter: React.Dispatch<React.SetStateAction<(Polygon | MultiPolygon)[]>>;
  setDatasetFilters: React.Dispatch<React.SetStateAction<FilterableDatasetMetadata>>;
  setPreview: React.Dispatch<React.SetStateAction<boolean>>;
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
  const [preview, setPreview] = useState<boolean>(false);
  const [geometryfilter, setGeometryFilter] = useState<(Polygon | MultiPolygon)[]>([]);
  const [datasetFilters, setDatasetFilters] = useState<FilterableDatasetMetadata>({});

  const filter = useMemo(() => ({ geometries: geometryfilter, parameters: datasetFilters }), [geometryfilter, datasetFilters]);
  const { fetchedFilteredResults } = useFetchFilteredDatasets(filter);

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

  const datasetsSummary = useMemo<DatasetSummary>(() => {
    return computeDatasetSummary(fetchedFilteredResults);
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
        preview,
        selectDataset,
        setSearchValue,
        setFilters,
        selectAllDatasets,
        setDatasetFilters,
        setPreview,
        setGeometryFilter,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
