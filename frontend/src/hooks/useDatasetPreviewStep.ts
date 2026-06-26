import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useApiMutation } from './useApiMutation';
import { useCreateJobMutation } from './useJobsApi';
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
import useIngestionFlow from './useIngestionFlow';
import { useDataset } from './useDatasets';

export const SOIL_DATA_LIMIT = 12;

export function useDatasetPreview(datasetId?: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { markAsChanged, resetChanges } = useIngestionFlow();

  useEffect(() => {
    markAsChanged();
  }, [markAsChanged]);

  useEffect(() => {
    return () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'mappings'] });
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'dataset-file-mapping'] });
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'files'] });
      queryClient.removeQueries({ queryKey: ['datasets', datasetId, 'mapping-soil-data'], exact: false });
    };
  }, [queryClient, datasetId]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<DatasetFileMappingResponse | null>(null);

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [allSoilData, setAllSoilData] = useState<SoilRecord[]>([]);

  const [sort, setSort] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<1 | -1 | null>(null);
  const [markedForDeletion, setMarkedForDeletion] = useState<Map<string, Set<number>>>(new Map());
  const fileMappingIdRef = useRef<string | undefined>(undefined);
  const selectedFileRef = useRef<string | null>(selectedFile);

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [showLoadingPanel, setShowLoadingPanel] = useState(false);

  const { data: dataset, isLoading: isDatasetLoading } = useDataset(datasetId);

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
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

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

      if (!selectedFile) return;

      setMarkedForDeletion(prev => {
        const next = new Map(prev);
        const fileSet = new Set(next.get(selectedFile) ?? []);

        soilData.forEach(record => {
          if (record.user_dropped) {
            fileSet.add(record.record_id);
          }
        });

        next.set(selectedFile, fileSet);
        return next;
      });
    }
  }, [selectedFile, soilData]);

  const loadMore = useCallback(() => {
    if (!soilData?.length || !hasMore) return;
    setCursor(soilData[soilData.length - 1].cursor);
  }, [soilData, hasMore]);

  const toggleDeletion = useCallback(
    (recordId: number) => {
      if (!selectedFile) return;

      setMarkedForDeletion(prev => {
        const next = new Map(prev);
        const fileSet = new Set(next.get(selectedFile) ?? []);
        if (fileSet.has(recordId)) {
          fileSet.delete(recordId);
        } else {
          fileSet.add(recordId);
        }
        next.set(selectedFile, fileSet);
        return next;
      });
    },
    [selectedFile],
  );

  const currentFileDeletions = useMemo(
    () => (selectedFile ? (markedForDeletion.get(selectedFile) ?? new Set<number>()) : new Set<number>()),
    [markedForDeletion, selectedFile],
  );

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
      setAvailableColumns(Object.keys(allSoilData[0]).filter(key => !['record_id', 'geometry', 'cursor', 'user_dropped'].includes(key)));
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

  const isLoading =
    isLoadingSoilProperties || isLoadingMappings || isLoadingFileMapping || isLoadingSoilData || isLoadingFiles || isDatasetLoading;

  const { mutateAsync: createJob } = useCreateJobMutation();

  const { mutateAsync: createMapping, isPending: isCreatingMapping } = useApiMutation<DataMappingResponse, DataMappingRequestWithDrop>({
    endpoint: '/mappings',
    method: 'POST',
  });

  const { mutateAsync: updateFileMapping, isPending: isUpdatingFileMapping } = useApiMutation<
    DatasetFileMappingResponse,
    DatasetFileMappingRequest
  >({
    endpoint: () => `/datasets/${datasetId}/dataset-file-mapping/${fileMappingIdRef.current}`,
    method: 'PATCH',
  });

  const save = useCallback(async () => {
    if (!datasetId || !datasetFileMappings?.length) return;

    resetChanges();
    for (const fileMapping of datasetFileMappings) {
      const dataMapping = mappings?.find(m => m.id === fileMapping.mappingId)?.data_mapping;
      if (!dataMapping) continue;

      const deletionSet = markedForDeletion.get(fileMapping.fileID) ?? new Set<number>();
      fileMappingIdRef.current = fileMapping.id;
      const newMapping = await createMapping({ ...dataMapping, drop_records: [...deletionSet] });
      await updateFileMapping({ fileID: fileMapping.fileID, mappingId: newMapping.id });
    }
  }, [datasetId, datasetFileMappings, mappings, markedForDeletion, createMapping, updateFileMapping, resetChanges]);

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/mappings`);
  }, [navigate, datasetId]);

  const handleSaveAndContinueLater = useCallback(async () => {
    await save();
    navigate(ADMIN_PATHS.DATASETS);
  }, [save, navigate]);

  const handleContinue = useCallback(async () => {
    await save();
    await createJob({ type: 'bulk-load', dataset_id: datasetId!, delete_source_files: true });
    setShowLoadingPanel(true);
  }, [save, createJob, datasetId]);

  const navigateToDatasets = useCallback(() => {
    navigate(ADMIN_PATHS.DATASETS);
  }, [navigate]);

  const datasetName = useMemo(() => {
    return dataset?.name || '';
  }, [dataset]);

  return {
    datasetName,
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
    currentFileDeletions,
    isSaving: isCreatingMapping || isUpdatingFileMapping,
    onFileChange,
    loadMore,
    onSortChange,
    toggleDeletion,
    showLoadingPanel,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
    navigateToDatasets,
  };
}
