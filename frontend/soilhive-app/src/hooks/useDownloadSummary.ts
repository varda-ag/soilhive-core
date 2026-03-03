import type { BackendStoredDataFilter, DataFilter, FilteredDataset } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { computeDatasetSummary } from '../domain';
import { useSoilProperties } from './useSoilProperties';

export function useDownloadSummary({ filterId }: { filterId: string | null }) {
  const { data: allSoilProperties, isLoading: areSoilPropertiesLoading } = useSoilProperties();

  const { data: filterData, isLoading: isFilterLoading } = useApiQuery<BackendStoredDataFilter, DataFilter>({
    endpoint: `/data-filters/${filterId}`,
    method: 'GET',
    queryKey: ['data-filter', filterId],
    enabled: true,
  });

  const filteredSoilPropertyIds = filterData?.filter.parameters.soil_properties;
  const soilProperties = filteredSoilPropertyIds
    ? allSoilProperties
        ?.filter(soilProperty => filteredSoilPropertyIds.includes(soilProperty.id))
        .map(soilProperty => soilProperty.property_name)
    : undefined;

  const minDepth = filterData?.filter.parameters.min_depth;
  const maxDepth = filterData?.filter.parameters.max_depth;
  const depthRange: string | undefined = minDepth !== undefined && maxDepth !== undefined ? `${minDepth}-${maxDepth}cm` : undefined;

  const geometryFilter = filterData?.filter.geometries;
  const geometryFeature = geometryFilter
    ? { type: 'FeatureCollection', features: geometryFilter.map(geometry => ({ geometry })) }
    : undefined;

  const { data: coverageData, isLoading: isCoverageLoading } = useApiQuery<FilteredDataset[]>({
    endpoint: `/data-filters/${filterId}/coverage`,
    method: 'GET',
    queryKey: ['data-filter-coverage', filterId],
    enabled: true,
  });

  const datasetsSummary = computeDatasetSummary(coverageData);

  return {
    geometryFeature,
    datasetsSummary,
    soilProperties,
    depthRange,
    isLoading: areSoilPropertiesLoading || isFilterLoading || isCoverageLoading,
  };
}
