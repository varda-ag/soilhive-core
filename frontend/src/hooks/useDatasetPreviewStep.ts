import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import type {
  DataMappingRequestWithDrop,
  DataMappingResponse,
  DatasetFileMappingRequest,
  DatasetFileMappingResponse,
  FileDescriptor,
  SoilRecord,
} from 'types/backend';
import { useSoilProperties } from './useSoilProperties';
import { ADMIN_PATHS } from '../configuration/admin';
import { sanitizeField } from '../utilities/dataMapping';

export const SOIL_DATA_LIMIT = 12;

export function useDatasetPreview(datasetId?: string) {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<DatasetFileMappingResponse | null>(null);

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allSoilData, setAllSoilData] = useState<SoilRecord[]>([]);

  const [sort, setSort] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);
  const [markedForDeletion, setMarkedForDeletion] = useState<Set<number>>(new Set());

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  const { data: soilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();

  const { data: files, isLoading: isLoadingFiles } = useApiQuery<FileDescriptor[]>({
    endpoint: `/datasets/${datasetId}/files`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'files'],
    enabled: !!datasetId,
  });

  const { data: datasetFileMappings, isLoading: isLoadingFileMapping } = useApiQuery<DatasetFileMappingResponse[]>({
    endpoint: `/datasets/${datasetId}/dataset-file-mapping`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'dataset-file-mapping'],
    enabled: !!datasetId,
  });

  const { data: mappings, isLoading: isLoadingMappings } = useApiQuery<DataMappingResponse[]>({
    endpoint: `/datasets/${datasetId}/mappings`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'mappings'],
    enabled: !!datasetId,
  });

  const computedMappings = useMemo(() => {
    const dataMapping = mappings?.find(mapping => mapping.id === selectedMapping?.mappingId)?.data_mapping;
    if (dataMapping) {
      const mapping: Record<string, string> = {};
      Object.keys(dataMapping).forEach(key => {
        const sanitizedKey = sanitizeField(key);
        if (typeof dataMapping[key] === 'object') {
          mapping[sanitizedKey] = dataMapping[key].property_id;
        } else {
          mapping[sanitizedKey] = dataMapping[key];
        }
      });

      return mapping;
    }
    return null;
  }, [mappings, selectedMapping]);

  const { computedPropertyNames, unitsMapping } = useMemo(() => {
    if (!soilProperties || !computedMappings) {
      return { computedPropertyNames: {} as Record<string, string>, unitsMapping: {} as Record<string, string | undefined> };
    }
    const names: Record<string, string> = {};
    const units: Record<string, string | undefined> = {};
    Object.keys(computedMappings).forEach(mappingKey => {
      const foundProperty = soilProperties.find(property => property.id === computedMappings[mappingKey]);
      names[mappingKey] = foundProperty?.property_name || computedMappings[mappingKey];
      units[mappingKey] = foundProperty?.standard_unit;
    });
    return { computedPropertyNames: names, unitsMapping: units };
  }, [computedMappings, soilProperties]);

  useEffect(() => {
    if (datasetFileMappings?.length) {
      setSelectedFile(datasetFileMappings[0].fileID);
      setSelectedMapping(datasetFileMappings[0]);
    }
  }, [datasetFileMappings]);

  useEffect(() => {
    setCursor(undefined);
    setAllSoilData([]);
  }, [selectedMapping?.id]);

  const soilDataQueryParameters = useMemo(() => {
    const params: [string, string][] = [['limit', `${SOIL_DATA_LIMIT}`]];
    if (cursor) params.push(['cursor', cursor]);
    if (sort) params.push(['sort', sort]);
    return params;
  }, [cursor, sort]);

  const { data: soilData, isLoading: isLoadingSoilData } = useApiQuery<SoilRecord[]>({
    endpoint: `/datasets/${datasetId}/dataset-file-mapping/${selectedMapping?.id}/soil-data`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'mapping-soil-data', selectedMapping?.id, cursor, sort],
    parameters: soilDataQueryParameters,
    enabled: !!datasetId && !!selectedMapping?.id,
    retry: 0,
  });

  const hasMore = (soilData?.length ?? 0) === SOIL_DATA_LIMIT;

  useEffect(() => {
    if (soilData?.length) {
      setAllSoilData(prev => [...prev, ...soilData]);
    }
  }, [soilData]);

  const loadMore = useCallback(() => {
    if (!soilData?.length || !hasMore) return;
    setCursor(soilData[soilData.length - 1].cursor);
  }, [soilData, hasMore]);

  const toggleDeletion = useCallback((recordId: number) => {
    setMarkedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  }, []);

  const onSortChange = useCallback((field: string, order: 1 | -1 | 0 | null | undefined) => {
    if (!order) {
      setSort(undefined);
      setSortField(undefined);
      setSortOrder(null);
    } else {
      setSort(order === -1 ? `-${field}` : field);
      setSortField(field);
      setSortOrder(order);
    }
    setCursor(undefined);
    setAllSoilData([]);
  }, []);

  useEffect(() => {
    if (allSoilData.length) {
      setAvailableColumns(Object.keys(allSoilData[0]).filter(key => !['record_id', 'geometry', 'cursor'].includes(key)));
    }
  }, [allSoilData]);

  const onFileChange = useCallback(
    (id: string) => {
      if (datasetFileMappings?.length) {
        setSelectedFile(id);
        const mapping = datasetFileMappings.find(mapping => mapping.fileID === id);

        if (mapping) {
          setSelectedMapping(mapping);
        }
      }
    },
    [datasetFileMappings],
  );

  const isLoading = isLoadingSoilProperties || isLoadingMappings || isLoadingFileMapping || isLoadingSoilData || isLoadingFiles;

  const { mutateAsync: createMapping, isPending: isCreatingMapping } = useApiMutation<DataMappingResponse, DataMappingRequestWithDrop>({
    endpoint: '/mappings',
    method: 'POST',
  });

  const { mutateAsync: updateFileMapping, isPending: isUpdatingFileMapping } = useApiMutation<
    DatasetFileMappingResponse,
    DatasetFileMappingRequest
  >({
    endpoint: () => `/datasets/${datasetId}/dataset-file-mapping/${selectedMapping?.id}`,
    method: 'PATCH',
  });

  const save = useCallback(async () => {
    if (!selectedMapping || !datasetId) return;
    const currentDataMapping = mappings?.find(m => m.id === selectedMapping.mappingId)?.data_mapping;
    if (!currentDataMapping) return;

    const newMapping = await createMapping({ ...currentDataMapping, drop_records: [...markedForDeletion] });
    await updateFileMapping({ fileID: selectedMapping.fileID, mappingId: newMapping.id });
  }, [selectedMapping, datasetId, mappings, markedForDeletion, createMapping, updateFileMapping]);

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/mappings`);
  }, [navigate, datasetId]);

  const handleSaveAndContinueLater = useCallback(async () => {
    await save();
    navigate(ADMIN_PATHS.DATASETS);
  }, [save, navigate]);

  const handleContinue = useCallback(async () => {
    await save();
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`); // Should be changed to redirect to the next screen
  }, [save, navigate, datasetId]);

  return {
    datasetFileMappings,
    files,
    soilData,
    selectedFile,
    allSoilData,
    computedPropertyNames,
    unitsMapping,
    availableColumns,
    isLoading,
    hasMore,
    isLoadingMore: isLoadingSoilData && allSoilData.length > 0,
    sortField,
    sortOrder,
    markedForDeletion,
    isSaving: isCreatingMapping || isUpdatingFileMapping,
    onFileChange,
    loadMore,
    onSortChange,
    toggleDeletion,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
  };
}
