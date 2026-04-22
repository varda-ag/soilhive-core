import type { BackendStoredDataFilter, DataFilter, License } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useFilteredCoverageQuery } from './useFilteredCoverageQuery';
import { useFilteredDatasetsQuery } from './useFilteredDatasetsQuery';
import { computeDatasetSummary } from '../domain';
import { useSoilProperties } from './useSoilProperties';
import { useMemo } from 'react';

export interface DownloadSummaryDataset {
  id: string;
  name: string;
  licenses: License[];
  dataType?: string;
  layerCount: number;
}

export function useDownloadSummary({ filterId, datasetsIds }: { filterId: string | null; datasetsIds: string[] }) {
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

  const { data: coverageData, isLoading: isCoverageLoading } = useFilteredCoverageQuery(filterId ?? undefined);
  const { data: datasetsData } = useFilteredDatasetsQuery(filterId ?? undefined);

  const { data: allLicenses, isLoading: areLicensesLoading } = useApiQuery<License[]>({
    endpoint: '/licenses',
    method: 'GET',
    queryKey: ['licenses'],
    enabled: true,
  });

  const allLicensesMap = useMemo(() => {
    return new Map(allLicenses?.map(license => [license.id, license]) ?? []);
  }, [allLicenses]);

  const datasets: DownloadSummaryDataset[] | undefined = useMemo(() => {
    if (coverageData) {
      return coverageData.datasets
        .filter(dataset => datasetsIds.includes(dataset.id))
        .map(dataset => ({
          id: dataset.id,
          name: dataset.name,
          licenses: (dataset.licenses ?? []).map(licenseId => allLicensesMap.get(licenseId)).filter(license => license !== undefined),
          dataType: dataset.data_type,
          layerCount: dataset.dataset_layer_count,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (datasetsData) {
      return datasetsData
        .filter(dataset => datasetsIds.includes(dataset.id))
        .map(dataset => ({
          id: dataset.id,
          name: dataset.name,
          licenses: [],
          dataType: dataset.data_type,
          layerCount: 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return undefined;
  }, [coverageData, datasetsData, datasetsIds, allLicensesMap]);

  return {
    datasets,
    geometryFeature,
    datasetsSummary: computeDatasetSummary(coverageData?.datasets),
    soilProperties,
    depthRange,
    isLoading: areSoilPropertiesLoading || isFilterLoading || isCoverageLoading || areLicensesLoading,
  };
}
