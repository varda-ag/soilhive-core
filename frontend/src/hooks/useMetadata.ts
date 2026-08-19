import type { Dataset, InferredProperty, License } from 'types/backend';
import { useApiQuery } from './useApiQuery';
import { useDataset } from './useDatasets';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useSoilProperties } from './useSoilProperties';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDatasetMutation } from './useDatasetMutation';
import { hasTextContent } from 'utilities/validation';

export type SaveCallbacks = { onSuccess: () => void; onError: (error: Error) => void };

export function useMetadata(datasetId: string | undefined) {
  const { data: rawDataset, isLoading: isDatasetLoading, isError: isDatasetError } = useDataset(datasetId);
  const updateDataset = useUpdateDatasetMutation(datasetId!);
  const queryClient = useQueryClient();

  const [dataset, setDataset] = useState<
    (Omit<Dataset, 'licenses'> & { licenses: License[]; soilProperties: string[] | undefined }) | undefined
  >(undefined);

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

  const soilProperties = useMemo(() => {
    const datasetSoilPropertyIds = rawDataset?.measured_properties?.map(measuredProperty => measuredProperty.soil_property_id);
    return datasetSoilPropertyIds
      ? allSoilProperties
          ?.filter(soilProperty => datasetSoilPropertyIds.includes(soilProperty.id))
          .map(soilProperty => soilProperty.property_name)
      : undefined;
  }, [rawDataset, allSoilProperties]);

  useEffect(() => {
    setDataset(
      rawDataset
        ? {
            ...rawDataset,
            licenses: (rawDataset.licenses ?? [])
              .map(licenseId => allLicensesMap.get(licenseId))
              .filter((license): license is License => license !== undefined),
            soilProperties,
          }
        : undefined,
    );
  }, [rawDataset, allLicensesMap, soilProperties]);

  const datasetInferredProperties = dataset?.inferred_properties;

  const inferredProperties: Set<InferredProperty> = useMemo(() => {
    if (datasetInferredProperties) {
      return new Set(datasetInferredProperties);
    }
    return new Set();
  }, [datasetInferredProperties]);

  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  const validate = useCallback((): boolean => {
    if (!dataset) return true;
    const errors = new Set<string>();
    const raw = dataset as unknown as Record<string, string | null | undefined>;

    for (const field of ['name', 'full_name', 'author', 'publication_date'] as const) {
      if (!raw[field]?.trim()) errors.add(field);
    }

    if (!hasTextContent(raw['description'] ?? '')) errors.add('description');

    if (!inferredProperties.has('soil_depth')) {
      const depth = dataset.soil_depth as { min?: number; max?: number } | null;
      if (depth?.min == null) errors.add('soil_depth_min');
      if (depth?.max == null) errors.add('soil_depth_max');
    }
    if (!inferredProperties.has('reference_period_start') && !raw['reference_period_start']?.trim()) {
      errors.add('reference_period_start');
    }
    if (!inferredProperties.has('reference_period_stop') && !raw['reference_period_stop']?.trim()) {
      errors.add('reference_period_stop');
    }
    if (!inferredProperties.has('licenses') && dataset.licenses.length === 0) {
      errors.add('licenses');
    }

    setFieldErrors(errors);
    return errors.size === 0;
  }, [dataset, inferredProperties]);

  const updateField = useCallback(
    (property: string, value: string | string[]) => {
      setDataset(prev => {
        if (!prev) return prev;
        if (property === 'soil_depth_min') {
          const min = value ? Number(value) : undefined;
          return { ...prev, soil_depth: { ...((prev.soil_depth as object) ?? {}), min } };
        }
        if (property === 'soil_depth_max') {
          const max = value ? Number(value) : undefined;
          return { ...prev, soil_depth: { ...((prev.soil_depth as object) ?? {}), max } };
        }
        if (property === 'licenses') {
          const licenseId = value as string;
          const license = allLicensesMap.get(licenseId);
          const licenseObj: License = license ?? ({ id: licenseId, name: licenseId } as License);
          return { ...prev, licenses: licenseId ? [licenseObj] : [] };
        }
        if (property === 'related_resources') {
          return { ...prev, related_resources: value as string[] };
        }
        return { ...prev, [property]: (value as string) || null };
      });
    },
    [allLicensesMap],
  );

  const handleFieldChange = useCallback(
    (property: string, value: string | string[]) => {
      updateField(property, value);
      setFieldErrors(prev => {
        if (!prev.has(property)) return prev;
        const next = new Set(prev);
        next.delete(property);
        return next;
      });
    },
    [updateField],
  );

  const saveAll = useCallback(
    (callbacks: SaveCallbacks) => {
      if (!dataset || !rawDataset || !datasetId) {
        callbacks.onSuccess();
        return;
      }

      const patch: Record<string, unknown> = {};

      const textFields = [
        'name',
        'full_name',
        'version',
        'description',
        'author',
        'data_producer',
        'spatial_resolution',
        'publication_date',
        'reference_period_start',
        'reference_period_stop',
        'gis_datatype',
        'citation',
        'preprocessing_steps',
      ] as const;

      for (const field of textFields) {
        const newVal = (dataset as unknown as Record<string, unknown>)[field] ?? null;
        const oldVal = (rawDataset as unknown as Record<string, unknown>)[field] ?? null;
        if (newVal !== oldVal) {
          patch[field] = newVal;
        }
      }

      if (JSON.stringify(dataset.soil_depth) !== JSON.stringify(rawDataset.soil_depth)) {
        patch.soil_depth = dataset.soil_depth;
      }

      const newLicenseIds = dataset.licenses.map(l => l.id);
      const oldLicenseIds = rawDataset.licenses ?? [];
      if (JSON.stringify(newLicenseIds) !== JSON.stringify(oldLicenseIds)) {
        patch.licenses = newLicenseIds;
      }

      const newRelated = dataset.related_resources ?? [];
      const oldRelated = rawDataset.related_resources ?? [];
      if (JSON.stringify(newRelated) !== JSON.stringify(oldRelated)) {
        patch.related_resources = newRelated.length > 0 ? newRelated : null;
      }

      if (Object.keys(patch).length === 0) {
        callbacks.onSuccess();
        return;
      }

      updateDataset.mutate(patch, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['dataset', datasetId] });
          callbacks.onSuccess();
        },
        onError: callbacks.onError,
      });
    },
    [dataset, rawDataset, datasetId, updateDataset, queryClient],
  );

  return {
    dataset,
    allLicenses,
    inferredProperties,
    isLoading: isDatasetLoading || areLicensesLoading || areSoilPropertiesLoading,
    isError: isDatasetError || areLicensesError || areSoilPropertiesError,
    updateField,
    handleFieldChange,
    fieldErrors,
    validate,
    saveAll,
  };
}
