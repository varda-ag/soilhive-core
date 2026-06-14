import type { Dataset, InferredProperty, License } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDataset } from './useDatasets';
import { useMemo, useCallback } from 'react';
import { useSoilProperties } from './useSoilProperties';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDatasetMutation } from './useDatasetMutation';

export type SaveCallbacks = { onSuccess: () => void; onError: (error: Error) => void };

function getOriginalValue(dataset: ReturnType<typeof useMetadata>['dataset'], property: string): string {
  if (!dataset) return '';
  switch (property) {
    case 'name':
      return dataset.name ?? '';
    case 'full_name':
      return dataset.full_name ?? '';
    case 'version':
      return dataset.version ?? '';
    case 'description':
      return dataset.description ?? '';
    case 'author':
      return dataset.author ?? '';
    case 'data_producer':
      return dataset.data_producer ?? '';
    case 'spatial_resolution':
      return dataset.spatial_resolution ?? '';
    case 'publication_date':
      return dataset.publication_date ?? '';
    case 'reference_period_start':
      return dataset.reference_period_start ?? '';
    case 'reference_period_stop':
      return dataset.reference_period_stop ?? '';
    case 'gis_datatype':
      return dataset.gis_datatype ?? '';
    case 'citation':
      return dataset.citation ?? '';
    case 'soil_depth_min':
      return (dataset.soil_depth as { min?: number } | null)?.min?.toString() ?? '';
    case 'soil_depth_max':
      return (dataset.soil_depth as { max?: number } | null)?.max?.toString() ?? '';
    case 'licenses':
      return (dataset?.licenses as License[] | undefined)?.[0]?.id ?? '';
    default:
      return '';
  }
}

function buildPatchPayload(property: string, value: string, dataset: { soil_depth?: object | null }): Partial<Dataset> | null {
  switch (property) {
    case 'soil_depth_min':
      return { soil_depth: { ...((dataset.soil_depth as object) ?? {}), min: value ? Number(value) : undefined } };
    case 'soil_depth_max':
      return { soil_depth: { ...((dataset.soil_depth as object) ?? {}), max: value ? Number(value) : undefined } };
    case 'soilProperties':
      return null;
    case 'licenses':
      return { licenses: value ? [value] : [] };
    default:
      return { [property]: value || null } as Partial<Dataset>;
  }
}

export function useMetadata(datasetId: string | undefined) {
  const { data: rawDataset, isLoading: isDatasetLoading, isError: isDatasetError } = useDataset(datasetId);
  const updateDataset = useUpdateDatasetMutation(datasetId!);
  const queryClient = useQueryClient();

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

  const dataset = useMemo(() => {
    return rawDataset
      ? {
          ...rawDataset,
          ...{
            licenses: (rawDataset.licenses ?? []).map(licenseId => allLicensesMap.get(licenseId)).filter(license => license !== undefined),
            soilProperties,
          },
        }
      : undefined;
  }, [rawDataset, allLicensesMap, soilProperties]);

  const datasetInferredProperties = dataset?.inferred_properties;

  const inferredProperties: Set<InferredProperty> = useMemo(() => {
    if (datasetInferredProperties) {
      return new Set(datasetInferredProperties);
    }
    return new Set();
  }, [datasetInferredProperties]);

  const updateProperty = useCallback(
    (property: string, newValue: string, callbacks: SaveCallbacks) => {
      const original = getOriginalValue(dataset, property);
      if (newValue === original) {
        callbacks.onSuccess();
        return;
      }
      const payload = buildPatchPayload(property, newValue, dataset!);
      if (!payload) {
        callbacks.onSuccess();
        return;
      }
      updateDataset.mutate(payload, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
          callbacks.onSuccess();
        },
        onError: error => callbacks.onError(error),
      });
    },
    [dataset, datasetId, updateDataset, queryClient],
  );

  const updateRelatedResources = useCallback(
    (newValue: string[], callbacks: SaveCallbacks) => {
      const original = dataset?.related_resources ?? [];
      if (JSON.stringify(newValue) === JSON.stringify(original)) {
        callbacks.onSuccess();
        return;
      }
      updateDataset.mutate(
        { related_resources: newValue.length > 0 ? newValue : null },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
            callbacks.onSuccess();
          },
          onError: error => callbacks.onError(error),
        },
      );
    },
    [dataset, datasetId, updateDataset, queryClient],
  );

  return {
    dataset,
    allLicenses,
    inferredProperties,
    isLoading: isDatasetLoading || areLicensesLoading || areSoilPropertiesLoading,
    isError: isDatasetError || areLicensesError || areSoilPropertiesError,
    updateProperty,
    updateRelatedResources,
  };
}
