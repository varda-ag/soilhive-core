import { GISDataType, type BackendStoredDataFilter, type DataFilterDTO } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useFilteredCoverageQuery } from './useFilteredCoverageQuery';
import { computeDatasetSummary } from '../domain';
import { useSoilProperties } from './useSoilProperties';
import { useMemo, useState } from 'react';

export function useDownloadPreview({
  filterId,
  datasetsIds,
  datasetTypesParams,
}: {
  filterId: string | null;
  datasetsIds: string[];
  datasetTypesParams: string[];
}) {
  const [userSelectedDatasets, setUserSelectedDatasets] = useState<string[] | null>(null);

  const { data: allSoilProperties, isLoading: areSoilPropertiesLoading } = useSoilProperties();

  const { data: availabilityFilters, isLoading: areAvailabilityFiltersLoading } = useApiQuery<BackendStoredDataFilter, DataFilterDTO>({
    endpoint: `/data-filters/${filterId}`,
    method: 'GET',
    queryKey: ['data-filter', filterId],
    enabled: filterId !== null,
  });

  const availabilitySelectedSoilProperties = availabilityFilters?.filter.parameters.soil_properties ?? [];

  const { data: availabilityCoverageData, isLoading: isAvailabilityCoverageDataLoading } = useFilteredCoverageQuery(filterId ?? undefined);

  const datasetsSummary = computeDatasetSummary(availabilityCoverageData?.datasets);

  const availableFixedDatasets = useMemo(
    () =>
      (availabilityCoverageData ? availabilityCoverageData.datasets : [])
        .filter(dataset => datasetsIds.includes(dataset.id) && dataset.data_type !== GISDataType.RASTER)
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    [availabilityCoverageData, datasetsIds],
  );

  const firstAvailableFixedDataset = availableFixedDatasets?.[0]?.id;

  // Derived synchronously so selectedDatasets is non-empty the moment datasets load,
  // eliminating the async-effect gap that caused the loading state to briefly go false.
  const selectedDatasets = useMemo(
    () => userSelectedDatasets ?? (firstAvailableFixedDataset ? [firstAvailableFixedDataset] : []),
    [userSelectedDatasets, firstAvailableFixedDataset],
  );

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
    setSelectedDatasets: setUserSelectedDatasets,
    geometryFilter,
  };
}
