import type { License } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDataset } from './useDatasets';
import { useMemo } from 'react';
import { useSoilProperties } from './useSoilProperties';

export function useMetadata(datasetId: string | undefined) {
  const { data: rawDataset, isLoading: isDatasetLoading, isError: isDatasetError } = useDataset(datasetId);

  const {
    data: allLicenses,
    isLoading: areLicensesLoading,
    isError: areLicensesError,
  } = useApiQuery<License[]>({
    endpoint: '/licenses',
    method: 'GET',
    queryKey: ['licenses'],
    enabled: true,
  });

  const allLicensesMap = useMemo(() => {
    return new Map(allLicenses?.map(license => [license.id, license]) ?? []);
  }, [allLicenses]);

  const { data: allSoilProperties, isLoading: areSoilPropertiesLoading, isError: areSoilPropertiesError } = useSoilProperties();

  const datasetSoilPropertyIds = rawDataset?.measured_properties?.map(measuredProperty => measuredProperty.soil_property_id);
  const soilProperties = datasetSoilPropertyIds
    ? allSoilProperties
        ?.filter(soilProperty => datasetSoilPropertyIds.includes(soilProperty.id))
        .map(soilProperty => soilProperty.property_name)
    : undefined;

  const dataset = rawDataset
    ? {
        ...rawDataset,
        ...{
          licenses: (rawDataset.licenses ?? []).map(licenseId => allLicensesMap.get(licenseId)).filter(license => license !== undefined),
          soilProperties,
        },
      }
    : undefined;

  return {
    dataset,
    isLoading: isDatasetLoading || areLicensesLoading || areSoilPropertiesLoading,
    isError: isDatasetError || areLicensesError || areSoilPropertiesError,
  };
}
