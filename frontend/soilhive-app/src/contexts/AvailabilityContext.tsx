import { useDatasetFilter, type DatasetFilter, type PostDatasetFilterResponse } from 'hooks/useDatasetFilter';
import React, { createContext, useState, useEffect, type ReactNode, useCallback, useMemo } from 'react';
import type { AvailabilityDataset } from 'types/availability';

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
  data: PostDatasetFilterResponse | undefined;
};

export const AvailabilityContext = createContext<AvailabilityContextType | undefined>(undefined);

type AvailabilityProviderProps = {
  children: ReactNode;
};

const MOCK_DATASETS: AvailabilityDataset[] = [
  {
    id: 'dataset-1',
    name: 'SoilGrids 250m',
    views: '12.3k',
    tags: ['Global'],
    properties: {
      points: 34546,
      layers: 12,
      minDepth: 0,
      maxDepth: 60,
      dateStart: 2012,
      dateEnd: 2025,
    },
  },
  {
    id: 'dataset-2',
    name: 'GSOCmap',
    views: '12.3k',
    tags: ['Global'],
    properties: {
      points: 234546,
      layers: 8,
      minDepth: 0,
      maxDepth: 60,
      dateStart: 2006,
      dateEnd: 2024,
    },
  },
  {
    id: 'dataset-3',
    name: 'Downforce Technologies',
    views: '12.3k',
    tags: ['Kenya', 'Private'],
    properties: {
      points: 14546,
      layers: 14,
      minDepth: 0,
      maxDepth: 60,
      dateStart: 2014,
      dateEnd: 2024,
    },
  },
];

export const AvailabilityProvider: React.FC<AvailabilityProviderProps> = ({ children }) => {
  const [datasets, setDatasets] = useState<AvailabilityDataset[]>([]);
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
  const { data } = useDatasetFilter(datasetFilters);

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
      setSelectedDatasets(select ? datasets.map((dataset: AvailabilityDataset) => dataset.id) : []);
      setIsAllSelected(select);
    },
    [datasets],
  );

  const datasetsSummary = useMemo(() => {
    let globalDataPoints = 0;
    let globalLayers = 0;
    let globalMinDepth: number | null = null;
    let globalMaxDepth: number | null = null;
    let globalDateStart: number | null = null;
    let globalDateEnd: number | null = null;

    for (const dataset of datasets) {
      globalMinDepth = globalMinDepth === null ? dataset.properties.minDepth : Math.min(globalMinDepth, dataset.properties.minDepth);

      globalMaxDepth = globalMaxDepth === null ? dataset.properties.maxDepth : Math.max(globalMaxDepth, dataset.properties.maxDepth);

      globalDateStart = globalDateStart === null ? dataset.properties.dateStart : Math.min(globalDateStart, dataset.properties.dateStart);

      globalDateEnd = globalDateEnd === null ? dataset.properties.dateEnd : Math.max(globalDateEnd, dataset.properties.dateEnd);

      globalLayers = Math.max(globalLayers, dataset.properties.layers);

      globalDataPoints += dataset.properties.points;
    }

    return {
      count: datasets.length,
      dataPoints: globalDataPoints,
      layers: globalLayers,
      depth: `${globalMinDepth} - ${globalMaxDepth}`,
      date: `${globalDateStart} - ${globalDateEnd}`,
    };
  }, [datasets]);

  useEffect(() => {
    setDatasets(MOCK_DATASETS);
  }, []);

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
        data,
      }}
    >
      {children}
    </AvailabilityContext.Provider>
  );
};
