import type { BackendStoredDataFilter, DataFilter, FilteredData } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { computeDatasetSummary } from '../domain';
import { useSoilProperties } from './useSoilProperties';
import { useMemo, useState } from 'react';
import { useOnceDefined } from './useOnceDefined';

export function useDownloadPreview({
  filterId,
  datasetsIds,
  datasetTypesParams,
}: {
  filterId: string | null;
  datasetsIds: string[];
  datasetTypesParams: string[];
}) {
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);

  const { data: allSoilProperties, isLoading: areSoilPropertiesLoading } = useSoilProperties();

  const { data: availabilityFilters, isLoading: areAvailabilityFiltersLoading } = useApiQuery<BackendStoredDataFilter, DataFilter>({
    endpoint: `/data-filters/${filterId}`,
    method: 'GET',
    queryKey: ['data-filter', filterId],
    enabled: filterId !== null,
  });

  const availabilitySelectedSoilProperties = availabilityFilters?.filter.parameters.soil_properties ?? [];

  const { data: availabilityCoverageData, isLoading: isAvailabilityCoverageDataLoading } = useApiQuery<FilteredData>({
    endpoint: `/data-filters/${filterId}/coverage`,
    method: 'GET',
    queryKey: ['data-filter-coverage', filterId],
    enabled: filterId !== null,
  });

  const datasetsSummary = computeDatasetSummary(availabilityCoverageData?.datasets);

  const availableFixedDatasets = useMemo(
    () =>
      (availabilityCoverageData ? availabilityCoverageData.datasets : [])
        .filter(dataset => datasetsIds.includes(dataset.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    [availabilityCoverageData, datasetsIds],
  );

  const firstAvailableFixedDataset = availableFixedDatasets?.[0]?.id;
  useOnceDefined(firstAvailableFixedDataset, datasetId => {
    setSelectedDatasets([datasetId]);
  });

  const availableFixedDatasetsSoilProperties = useMemo(() => {
    const datasets = datasetTypesParams.length
      ? availableFixedDatasets.filter(dataset => datasetTypesParams.includes(dataset.data_type as string))
      : availableFixedDatasets;
    return new Set(datasets.flatMap(dataset => dataset.soil_properties ?? []));
  }, [availableFixedDatasets, datasetTypesParams]);

  const availabilityFilteredSoilProperties = useMemo(
    () => allSoilProperties?.filter(soilProperty => availableFixedDatasetsSoilProperties.has(soilProperty.id)) ?? [],
    [allSoilProperties, availableFixedDatasetsSoilProperties],
  );

  const geometryFilter = useMemo(() => availabilityFilters?.filter.geometries ?? [], [availabilityFilters]);

  return {
    isLoading: areAvailabilityFiltersLoading || isAvailabilityCoverageDataLoading || areSoilPropertiesLoading,
    availableFixedDatasets,
    availabilitySelectedFilters: availabilityFilters,
    availabilitySelectedSoilProperties,
    availabilityFilteredSoilProperties,
    datasetsSummary,
    selectedDatasets,
    setSelectedDatasets,
    geometryFilter,
  };
}
