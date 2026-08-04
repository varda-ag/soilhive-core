import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useIngestionStatus } from './useIngestionStatus';
import { useApiQueries } from './useApiQueries';
import { useCreateProcedureMutation } from './useCreateProcedureMutation';
import { useCreateMappingsMutation } from './useCreateMappingsMutation';
import { useUpdateDatasetFileMappingMutation } from './useDatasetMutation';
import { useSoilProperties } from './useSoilProperties';
import { useCreateJobMutation, useJobsQueries } from './useJobsApi';
import { ADMIN_PATHS } from '../configuration/admin';
import { IngestionStatus } from 'types/backend';
import useIngestionFlow from './useIngestionFlow';
import type {
  FileDescriptor,
  RasterFileDescriptorMetadata,
  VocabularyItem,
  PropertyMapping,
  DataMappingRequest,
  DataMappingObject,
  DataMappingResponse,
  DatasetFileMappingResponse,
  ProcedurePayload,
  ProcedureResponse,
} from 'types/backend';
import type { MenuOption } from 'components/UI/types';
import { useDataset } from './useDatasets';

export interface RowDetails {
  laboratoryMethod: string | null;
}

export interface ColumnMapping {
  columnName: string;
  fileId: string;
  bandKey: number;
  conceptId: string | null;
  unitId: string | null;
  minDepth: string | null;
  maxDepth: string | null;
  referencePeriodStart: string | null;
  referencePeriodStop: string | null;
  layerDescription: string | null;
  additionalResources: { file_id: string }[];
  details: RowDetails;
  isGeometryDetectedField: boolean;
}

// One row per raster band, named after the file it came from — a raster with multiple bands
// gets one row per band (e.g. "file_bulk_raster.tif (band 1)"), while a single-band raster is
// just named after the file, with no band number. The displayed band number (from the file's
// metadata) is 1-indexed for readability, but bandKey — the key used to serialize into a file's
// data_mapping — is the band's zero-based position within the file (0, 1, 2, ...).
function buildColumns(files: FileDescriptor[]): { columnName: string; fileId: string; bandKey: number }[] {
  return files.flatMap(f => {
    const bands = (f.metadata as RasterFileDescriptorMetadata).raster_bands;
    if (bands.length <= 1) {
      return [{ columnName: f.name, fileId: f.id, bandKey: 0 }];
    }
    return bands.map((b, index) => ({ columnName: `${f.name} (band ${b.band_number})`, fileId: f.id, bandKey: index }));
  });
}

export type DetailOptionMap = Record<keyof RowDetails, MenuOption[]>;

const VOCAB_CATEGORY_TO_KEY: Record<string, keyof RowDetails> = {
  laboratory_method: 'laboratoryMethod',
};

const EMPTY_DETAILS: RowDetails = {
  laboratoryMethod: null,
};

function toProcedurePayload(details: RowDetails): ProcedurePayload {
  return {
    laboratory_method: details.laboratoryMethod ?? undefined,
  };
}

function procedurePayloadMatches(details: RowDetails, proc: ProcedureResponse): boolean {
  const n = (v: string | null | undefined) => v ?? null;
  return n(details.laboratoryMethod) === n(proc.laboratory_method);
}

// Creates a procedure record for each mapped column that has at least one detail field filled in.
// Reuses the existing procedure when its payload matches; creates a new one only when details changed.
async function createMappingProcedures(
  mappings: ColumnMapping[],
  existingProcedures: Record<string, ProcedureResponse>,
  createProcedure: (payload: ProcedurePayload) => Promise<ProcedureResponse>,
): Promise<Record<string, string>> {
  const procedureIds: Record<string, string> = {};
  for (const mapping of mappings) {
    if (!mapping.conceptId) continue;
    if (!Object.values(mapping.details).some(v => v !== null)) continue;
    const existing = existingProcedures[mapping.columnName];
    if (existing && procedurePayloadMatches(mapping.details, existing)) {
      procedureIds[mapping.columnName] = existing.id;
      continue;
    }
    const procedure = await createProcedure(toProcedurePayload(mapping.details));
    procedureIds[mapping.columnName] = procedure.id;
  }
  return procedureIds;
}

// Builds one mapping payload per file, keyed by the band's zero-based position within that file
// (not by column name) — a file's mapping only needs to distinguish its own bands, so the key
// is just e.g. "0", "1". The value is an object that may include the concept id, unit
// conversion id, and procedure id.
function buildDataMappingRequestsByFile(
  mappings: ColumnMapping[],
  procedureIds: Record<string, string>,
): Record<string, DataMappingRequest> {
  const requestsByFile: Record<string, DataMappingRequest> = {};
  for (const m of mappings) {
    if (!m.conceptId) continue;
    const request = (requestsByFile[m.fileId] ??= {});
    const bandKey = String(m.bandKey);
    const pm: PropertyMapping = { property_id: m.conceptId };
    if (m.unitId) pm.conversion_id = m.unitId;
    if (procedureIds[m.columnName]) pm.procedure_id = procedureIds[m.columnName];
    if (m.minDepth) pm.min_depth = Number(m.minDepth);
    if (m.maxDepth) pm.max_depth = Number(m.maxDepth);
    if (m.referencePeriodStart) pm.reference_period_start = m.referencePeriodStart;
    if (m.referencePeriodStop) pm.reference_period_stop = m.referencePeriodStop;
    if (m.layerDescription) pm.layer_description = m.layerDescription;
    if (m.additionalResources.length > 0) pm.additional_resources = m.additionalResources;
    request[bandKey] = pm;
  }
  return requestsByFile;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMappingChanged(
  columnMappings: ColumnMapping[],
  dataMappingByFileId: Record<string, DataMappingObject>,
  procedureByColumn: Record<string, ProcedureResponse>,
): boolean {
  if (Object.keys(dataMappingByFileId).length === 0) return true;

  for (const m of columnMappings) {
    const existing = dataMappingByFileId[m.fileId]?.[String(m.bandKey)];

    if (m.conceptId === null) {
      if (existing !== undefined) return true;
      continue;
    }

    if (existing === undefined) return true;

    if (typeof existing === 'string') return true;
    if (existing.property_id !== m.conceptId) return true;
    if ((existing.conversion_id ?? null) !== m.unitId) return true;
    if ((existing.min_depth ?? null) !== (m.minDepth ? Number(m.minDepth) : null)) return true;
    if ((existing.max_depth ?? null) !== (m.maxDepth ? Number(m.maxDepth) : null)) return true;
    if ((existing.reference_period_start ?? null) !== m.referencePeriodStart) return true;
    if ((existing.reference_period_stop ?? null) !== m.referencePeriodStop) return true;
    if ((existing.layer_description ?? null) !== m.layerDescription) return true;
    const existingResourceIds = (existing.additional_resources ?? []).map(r => r.file_id).sort();
    const currentResourceIds = m.additionalResources.map(r => r.file_id).sort();
    if (JSON.stringify(existingResourceIds) !== JSON.stringify(currentResourceIds)) return true;
    const proc = procedureByColumn[m.columnName];
    if (proc) {
      if (!procedurePayloadMatches(m.details, proc)) return true;
    } else {
      if (Object.values(m.details).some(v => v !== null)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRasterMappingStep(datasetId?: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { markAsChanged, resetChanges, isRaster } = useIngestionFlow();
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

  // One raster file gets its own mapping (each keyed by band number, not by column name), so
  // there's one DataMappingResponse per file rather than a single mapping for the whole dataset.
  // dataset-file-mapping links each file to its mapping id; cross-reference the two to find the
  // data_mapping that belongs to a given file.
  const dataMappingById = useMemo(() => {
    const map: Record<string, DataMappingObject> = {};
    for (const dm of existingMappings ?? []) map[dm.id] = dm.data_mapping;
    return map;
  }, [existingMappings]);

  const dataMappingByFileId = useMemo(() => {
    if (isLoadingFiles || isLoadingExistingMappings || isLoadingDatasetFileMappings) return {};
    const map: Record<string, DataMappingObject> = {};
    for (const dfm of datasetFileMappings ?? []) {
      const dataMapping = dataMappingById[dfm.mappingId];
      if (dataMapping) map[dfm.fileID] = dataMapping;
    }
    return map;
  }, [datasetFileMappings, dataMappingById, isLoadingFiles, isLoadingExistingMappings, isLoadingDatasetFileMappings]);

  const columns = useMemo(() => buildColumns(files ?? []), [files]);

  // Extract procedures from existing (loaded from the server) mappings, so we can fetch them and pre-populate the details fields.
  const proceduresInMapping = useMemo(() => {
    const result: { columnName: string; procedureId: string }[] = [];
    for (const { columnName, fileId, bandKey } of columns) {
      const entry = dataMappingByFileId[fileId]?.[String(bandKey)];
      if (entry && typeof entry !== 'string' && entry.procedure_id) {
        result.push({ columnName, procedureId: entry.procedure_id });
      }
    }
    return result;
  }, [columns, dataMappingByFileId]);

  // load procedures details from the server to populate detail fields
  const procedureDetails = useApiQueries<ProcedureResponse>(
    proceduresInMapping.map(({ procedureId }) => ({
      endpoint: `/procedures/${procedureId}`,
      method: 'GET',
      queryKey: ['procedures', procedureId],
      enabled: true,
    })),
  );

  const isLoadingProcedures = proceduresInMapping.length > 0 && procedureDetails.some(r => r.isLoading);

  const procedureByColumn = useMemo(() => {
    const map: Record<string, ProcedureResponse> = {};
    proceduresInMapping.forEach(({ columnName }, i) => {
      const data = procedureDetails[i]?.data;
      if (data) map[columnName] = data;
    });
    return map;
    // procedureDetails is a new array every render — use isLoadingProcedures as a stable proxy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proceduresInMapping, isLoadingProcedures]);

  const { data: soilProperties, isLoading: isLoadingSoilProperties } = useSoilProperties();

  const { data: vocabularyItems, isLoading: isLoadingVocabulary } = useApiQuery<VocabularyItem[]>({
    endpoint: '/vocabulary',
    method: 'GET',
    queryKey: ['vocabulary'],
    enabled: true,
  });

  const isLoading =
    isLoadingFiles ||
    isLoadingSoilProperties ||
    isLoadingVocabulary ||
    isLoadingExistingMappings ||
    isLoadingProcedures ||
    isLoadingDatasetFileMappings;

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
      if (isRaster) {
        setShowLoadingPanel(true);
      } else {
        navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
      }
    }
  }, [isImportingState, activeJobIds, jobsData, isIngestionLoading, datasetId, updateFurthestStep, navigate, isRaster]);

  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // Initialise the mapping table from the raster bands detected on the uploaded file(s),
  // hydrating each row with any previously saved mapping (looked up per file/band via
  // dataMappingByFileId) and procedure details.
  useEffect(() => {
    if (!files) return;

    setColumnMappings(
      columns.map(({ columnName, fileId, bandKey }) => {
        const isGeometryDetectedField = false;
        const existing = dataMappingByFileId[fileId]?.[String(bandKey)];
        if (!existing) {
          return {
            columnName,
            fileId,
            bandKey,
            conceptId: null,
            unitId: null,
            minDepth: null,
            maxDepth: null,
            referencePeriodStart: null,
            referencePeriodStop: null,
            layerDescription: null,
            additionalResources: [],
            details: { ...EMPTY_DETAILS },
            isGeometryDetectedField,
          };
        }
        if (typeof existing === 'string') {
          return {
            columnName,
            fileId,
            bandKey,
            conceptId: existing,
            unitId: null,
            minDepth: null,
            maxDepth: null,
            referencePeriodStart: null,
            referencePeriodStop: null,
            layerDescription: null,
            additionalResources: [],
            details: { ...EMPTY_DETAILS },
            isGeometryDetectedField,
          };
        }
        const proc = procedureByColumn[columnName];
        const details: RowDetails = proc ? { laboratoryMethod: proc.laboratory_method ?? null } : { ...EMPTY_DETAILS };

        return {
          columnName,
          fileId,
          bandKey,
          conceptId: existing.property_id,
          unitId: existing.conversion_id ?? null,
          minDepth: existing.min_depth != null ? String(existing.min_depth) : null,
          maxDepth: existing.max_depth != null ? String(existing.max_depth) : null,
          referencePeriodStart: existing.reference_period_start ?? null,
          referencePeriodStop: existing.reference_period_stop ?? null,
          layerDescription: existing.layer_description ?? null,
          additionalResources: existing.additional_resources ?? [],
          details,
          isGeometryDetectedField,
        };
      }),
    );
  }, [files, columns, procedureByColumn, dataMappingByFileId]);

  const detailOptions = useMemo((): DetailOptionMap => {
    const base: DetailOptionMap = {
      laboratoryMethod: [],
    };

    for (const item of vocabularyItems ?? []) {
      const key = VOCAB_CATEGORY_TO_KEY[item.category];
      if (key) base[key] = [...base[key], { code: item.name, name: item.name }];
    }

    return base;
  }, [vocabularyItems]);

  // Unit options and sorted soil properties — depends only on API data, not user selections.
  const { soilPropertyOptions, unitOptionsByConcept } = useMemo(() => {
    const properties = soilProperties ?? [];
    const parentIds = new Set(properties.map(p => p.parent_property_id).filter(Boolean));
    const filteredProperties = properties.filter(p => !parentIds.has(p.id));
    const soilPropertyOptions = filteredProperties
      .map(p => ({ code: p.id, name: p.property_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const unitOptionsByConcept: Record<string, MenuOption[]> = {};
    for (const p of properties) {
      unitOptionsByConcept[p.id] = Object.entries(p.original_units_of_measurement ?? {}).map(([code, name]) => ({ code, name }));
    }
    return { soilPropertyOptions, unitOptionsByConcept };
  }, [soilProperties]);

  // Per-row concept options: every row offers the same list of soil properties.
  const conceptOptionsByColumn = useMemo((): Record<string, MenuOption[]> => {
    return Object.fromEntries(columnMappings.map(m => [m.columnName, soilPropertyOptions]));
  }, [columnMappings, soilPropertyOptions]);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { mappedCount, unmappedCount } = useMemo(() => {
    const mapped = columnMappings.filter(m => m.conceptId !== null).length;
    return { mappedCount: mapped, unmappedCount: columnMappings.length - mapped };
  }, [columnMappings]);

  const isContinueEnabled = useMemo(() => mappedCount > 0, [mappedCount]);

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

  const handleConceptChange = useCallback((columnName: string, value: string) => {
    const conceptId = value || null;

    setColumnMappings(prev =>
      prev.map(m => {
        if (m.columnName !== columnName) return m;
        // Clear the unit whenever the concept is removed
        const unitId = conceptId === null ? null : m.unitId;
        return { ...m, conceptId, unitId };
      }),
    );
  }, []);

  const handleUnitChange = useCallback((columnName: string, value: string) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, unitId: value || null } : m)));
  }, []);

  const handleMinDepthChange = useCallback((columnName: string, value: string) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, minDepth: value || null } : m)));
  }, []);

  const handleMaxDepthChange = useCallback((columnName: string, value: string) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, maxDepth: value || null } : m)));
  }, []);

  const handleDetailChange = useCallback((columnName: string, field: keyof RowDetails, value: string) => {
    setColumnMappings(prev =>
      prev.map(m => (m.columnName === columnName ? { ...m, details: { ...m.details, [field]: value || null } } : m)),
    );
  }, []);

  const handleReferencePeriodStartChange = useCallback((columnName: string, value: string) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, referencePeriodStart: value || null } : m)));
  }, []);

  const handleReferencePeriodStopChange = useCallback((columnName: string, value: string) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, referencePeriodStop: value || null } : m)));
  }, []);

  const handleLayerDescriptionChange = useCallback((columnName: string, value: string) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, layerDescription: value || null } : m)));
  }, []);

  const handleAdditionalResourcesChange = useCallback((columnName: string, value: { file_id: string }[]) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, additionalResources: value } : m)));
  }, []);

  const save = useCallback(async () => {
    const procedureIds = await createMappingProcedures(columnMappings, procedureByColumn, createProcedure);
    const requestsByFile = buildDataMappingRequestsByFile(columnMappings, procedureIds);

    // One mapping per file — each keyed by band number — linked to that file via dataset-file-mapping.
    await Promise.all(
      Object.entries(requestsByFile).map(async ([fileId, request]) => {
        const mappingResponse = await createMapping(request);
        const dfm = datasetFileMappings?.find(d => d.fileID === fileId);
        if (datasetId && dfm) {
          await updateDatasetFileMapping({ datasetId, datasetFileMappingId: dfm.id, mappingId: mappingResponse.id });
        }
      }),
    );

    resetChanges();

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'mappings'] }),
      queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'dataset-file-mapping'] }),
    ]);
  }, [
    columnMappings,
    procedureByColumn,
    createProcedure,
    createMapping,
    updateDatasetFileMapping,
    datasetId,
    datasetFileMappings,
    queryClient,
    resetChanges,
  ]);

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/soil-data`);
  }, [navigate, datasetId]);

  const handleSaveAndContinueLater = useCallback(async () => {
    await save();
    navigate(ADMIN_PATHS.DATASETS);
  }, [save, navigate]);

  const handleContinue = useCallback(async () => {
    const changed = isMappingChanged(columnMappings, dataMappingByFileId, procedureByColumn);

    if (!changed && allFilesStaged) {
      if (isRaster) {
        setShowLoadingPanel(true);
      } else {
        navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
      }
      return;
    }

    setIsImportingState(true);
    await save();
    // NOTE: the backend's file-to-db job currently rejects raster files (FTD_RASTER_NOT_SUPPORTED) —
    // this will fail server-side until a raster ingestion job is implemented.
    const jobs = await Promise.all(
      datasetFileMappings!.map(dfm => createJob({ type: 'file-to-db', file_id: dfm.fileID, dataset_id: datasetId })),
    );
    setActiveJobIds(jobs.map(j => j.id));
  }, [
    columnMappings,
    dataMappingByFileId,
    procedureByColumn,
    allFilesStaged,
    save,
    navigate,
    datasetId,
    datasetFileMappings,
    createJob,
    isRaster,
  ]);

  const datasetName = useMemo(() => {
    return dataset?.name || '';
  }, [dataset]);

  const datasetGisDataType = useMemo(() => dataset?.gis_datatype ?? null, [dataset]);

  return {
    isLoading,
    datasetName,
    datasetGisDataType,
    isImporting,
    showLoadingPanel,
    isContinueEnabled,
    columnMappings,
    conceptOptionsByColumn,
    unitOptionsByConcept,
    detailOptions,
    mappedCount,
    unmappedCount,
    expandedRows,
    toggleRow,
    handleConceptChange,
    handleUnitChange,
    handleMinDepthChange,
    handleMaxDepthChange,
    handleDetailChange,
    handleReferencePeriodStartChange,
    handleReferencePeriodStopChange,
    handleLayerDescriptionChange,
    handleAdditionalResourcesChange,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
  };
}
