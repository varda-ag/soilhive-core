import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useIngestionStatus } from './useIngestionStatus';
import { useCreateProcedureMutation } from './useCreateProcedureMutation';
import { useCreateMappingsMutation } from './useCreateMappingsMutation';
import { useUpdateDatasetFileMappingMutation } from './useDatasetMutation';
import { useCreateJobMutation, useJobsQueries } from './useJobsApi';
import { ADMIN_PATHS } from '../configuration/admin';
import { GISDataType, IngestionStatus } from 'types/backend';
import useIngestionFlow from './useIngestionFlow';
import type { FileDescriptor, DataMappingResponse, DatasetFileMappingResponse } from 'types/backend';
import { useDataset } from './useDatasets';

// Setup shared by useMappingsStep and useRasterMappingStep: dataset/files/mappings fetching,
// the mutations used to save a mapping and kick off ingestion, the "importing" state machine
// (including the job-polling completion effect), row-expansion state, and the previous/save-later
// navigation handlers. Each caller keeps its own columnMappings shape, save() implementation, and
// handleContinue logic — those differ per data model (per-column vs per-file/band).
export function useDatasetIngestionState(datasetId?: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { markAsChanged, resetChanges } = useIngestionFlow();
  const [showLoadingPanel, setShowLoadingPanel] = useState(false);
  const { isLoading: isIngestionLoading, updateFurthestStep } = useIngestionStatus();
  const hasTracked = useRef(false);

  useEffect(() => {
    markAsChanged();
  }, [markAsChanged]);

  useEffect(() => {
    if (!hasTracked.current && datasetId && !isIngestionLoading) {
      hasTracked.current = true;
      updateFurthestStep(datasetId, 'mappings');
    }
  }, [datasetId, isIngestionLoading, updateFurthestStep]);

  const { mutateAsync: createProcedure } = useCreateProcedureMutation();
  const { mutateAsync: createMapping } = useCreateMappingsMutation();
  const { mutateAsync: updateDatasetFileMapping } = useUpdateDatasetFileMappingMutation();
  const { mutateAsync: createJob } = useCreateJobMutation();

  // true from the moment Continue is clicked until navigate fires (or save fails)
  const [isImportingState, setIsImportingState] = useState(false);
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);

  const { data: dataset } = useDataset(datasetId);
  const datasetGisDataType = useMemo(() => dataset?.gis_datatype ?? null, [dataset]);

  const { data: files, isLoading: isLoadingFiles } = useApiQuery<FileDescriptor[]>({
    endpoint: `/datasets/${datasetId}/files`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'files'],
    enabled: !!datasetId,
  });

  const jobQueries = useJobsQueries(activeJobIds);
  const jobsData = useMemo(() => jobQueries.map(q => q.data).filter(Boolean), [jobQueries]);

  const { data: datasetFileMappings, isLoading: isLoadingDatasetFileMappings } = useApiQuery<DatasetFileMappingResponse[]>({
    endpoint: `/datasets/${datasetId}/dataset-file-mapping`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'dataset-file-mapping'],
    enabled: !!datasetId,
  });

  const serverIsImporting = files?.some(f => f.status === IngestionStatus.ONGOING) ?? false;
  const isImporting = isImportingState || serverIsImporting;
  const allFilesStaged = files?.every(f => f.status === IngestionStatus.STAGED) ?? false;

  const { data: existingMappings, isLoading: isLoadingExistingMappings } = useApiQuery<DataMappingResponse[]>({
    endpoint: `/datasets/${datasetId}/mappings`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'mappings'],
    enabled: !!datasetId,
  });

  useEffect(() => {
    if (!isImportingState || activeJobIds.length === 0 || isIngestionLoading || !datasetId) return;
    if (jobsData.length < activeJobIds.length) return;
    const allCompleted = jobsData.every(job => job!.status === 'completed');
    const anyFailed = jobsData.some(job => job!.status === 'failed');
    if (anyFailed) {
      setIsImportingState(false);
      setActiveJobIds([]);
      return;
    }
    if (allCompleted) {
      setIsImportingState(false);
      setActiveJobIds([]);
      updateFurthestStep(datasetId, 'preview');
      if (datasetGisDataType === GISDataType.RASTER) {
        setShowLoadingPanel(true);
      } else {
        navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
      }
    }
  }, [isImportingState, activeJobIds, jobsData, isIngestionLoading, datasetId, updateFurthestStep, navigate, datasetGisDataType]);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((columnName: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(columnName)) {
        next.delete(columnName);
      } else {
        next.add(columnName);
      }
      return next;
    });
  }, []);

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/soil-data`);
  }, [navigate, datasetId]);

  const saveAndContinueLater = useCallback(
    async (save: () => Promise<void>) => {
      await save();
      navigate(ADMIN_PATHS.DATASETS);
    },
    [navigate],
  );

  const datasetName = useMemo(() => dataset?.name || '', [dataset]);

  return {
    navigate,
    queryClient,
    resetChanges,
    showLoadingPanel,
    setShowLoadingPanel,
    createProcedure,
    createMapping,
    updateDatasetFileMapping,
    createJob,
    isImportingState,
    setIsImportingState,
    activeJobIds,
    setActiveJobIds,
    dataset,
    datasetName,
    datasetGisDataType,
    files,
    isLoadingFiles,
    datasetFileMappings,
    isLoadingDatasetFileMappings,
    isImporting,
    allFilesStaged,
    existingMappings,
    isLoadingExistingMappings,
    expandedRows,
    toggleRow,
    handlePrevious,
    saveAndContinueLater,
  };
}
