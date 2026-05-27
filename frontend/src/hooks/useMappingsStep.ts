import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import type {
  FileDescriptor,
  VocabularyItem,
  PropertyMapping,
  DataMappingRequest,
  DataMappingResponse,
  DatasetFileMappingResponse,
  ProcedurePayload,
  ProcedureResponse,
} from 'types/backend';
import type { MenuOption } from 'types/components';

export interface RowDetails {
  samplePretreatment: string | null;
  technique: string | null;
  laboratoryMethod: string | null;
  extractantConcentration: string | null;
  extractionRatio: string | null;
  extractionBase: string | null;
  measurementProcedure: string | null;
  limitOfDetection: string | null;
}

export interface ColumnMapping {
  columnName: string;
  conceptId: string | null;
  unitId: string | null;
  details: RowDetails;
}

export type DetailOptionMap = Record<keyof RowDetails, MenuOption[]>;

const METADATA_FIELD_OPTIONS: MenuOption[] = [
  { code: 'geometry', name: 'Geometry' },
  { code: 'latitude', name: 'Latitude' },
  { code: 'longitude', name: 'Longitude' },
  { code: 'sampling_date', name: 'Sampling date' },
  { code: 'depth', name: 'Depth' },
  { code: 'min_depth', name: 'Min depth' },
  { code: 'max_depth', name: 'Max depth' },
  { code: 'horizon', name: 'Horizon' },
  { code: 'license', name: 'License' },
];

// Exported so consumers can check whether a concept code is a metadata field
// without re-deriving it from METADATA_FIELD_OPTIONS.
export const METADATA_FIELD_CODES = new Set(METADATA_FIELD_OPTIONS.map(o => o.code));

const VOCAB_CATEGORY_TO_KEY: Record<string, keyof RowDetails> = {
  sample_pretreatment: 'samplePretreatment',
  laboratory_method: 'laboratoryMethod',
  extractant_concentration: 'extractantConcentration',
  extraction_ratio: 'extractionRatio',
  extraction_base: 'extractionBase',
  measurement_procedure: 'measurementProcedure',
  limit_of_detection: 'limitOfDetection',
};

const EMPTY_DETAILS: RowDetails = {
  samplePretreatment: null,
  technique: null,
  laboratoryMethod: null,
  extractantConcentration: null,
  extractionRatio: null,
  extractionBase: null,
  measurementProcedure: null,
  limitOfDetection: null,
};

function toProcedurePayload(details: RowDetails): ProcedurePayload {
  return {
    sample_pretreatment: details.samplePretreatment ?? undefined,
    technique: details.technique ?? undefined,
    laboratory_method: details.laboratoryMethod ?? undefined,
    extractant_concentration: details.extractantConcentration ?? undefined,
    extraction_ratio: details.extractionRatio ?? undefined,
    extraction_base: details.extractionBase ?? undefined,
    measurement_procedure: details.measurementProcedure ?? undefined,
    limit_of_detection: details.limitOfDetection ?? undefined,
  };
}

function procedurePayloadMatches(details: RowDetails, proc: ProcedureResponse): boolean {
  const n = (v: string | null | undefined) => v ?? null;
  return (
    n(details.samplePretreatment) === n(proc.sample_pretreatment) &&
    n(details.technique) === n(proc.technique) &&
    n(details.laboratoryMethod) === n(proc.laboratory_method) &&
    n(details.extractantConcentration) === n(proc.extractant_concentration) &&
    n(details.extractionRatio) === n(proc.extraction_ratio) &&
    n(details.extractionBase) === n(proc.extraction_base) &&
    n(details.measurementProcedure) === n(proc.measurement_procedure) &&
    n(details.limitOfDetection) === n(proc.limit_of_detection)
  );
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

// Builds the mapping payload. For metadata fields, this is just the concept id. For soil properties, it's an object that may include the concept id, unit conversion id, and procedure id.
function buildDataMappingRequest(mappings: ColumnMapping[], procedureIds: Record<string, string>): DataMappingRequest {
  const request: DataMappingRequest = {};
  for (const m of mappings) {
    if (!m.conceptId) continue;
    if (METADATA_FIELD_CODES.has(m.conceptId)) {
      request[m.columnName] = m.conceptId;
    } else {
      const pm: PropertyMapping = { property_id: m.conceptId };
      if (m.unitId) pm.conversion_id = m.unitId;
      if (procedureIds[m.columnName]) pm.procedure_id = procedureIds[m.columnName];
      request[m.columnName] = pm;
    }
  }
  return request;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isMappingChanged(
  columnMappings: ColumnMapping[],
  existingDataMapping: DataMappingRequest | undefined,
  procedureByColumn: Record<string, ProcedureResponse>,
): boolean {
  if (!existingDataMapping) return true;

  for (const m of columnMappings) {
    const existing = existingDataMapping[m.columnName];

    if (m.conceptId === null) {
      if (existing !== undefined) return true;
      continue;
    }

    if (existing === undefined) return true;

    if (METADATA_FIELD_CODES.has(m.conceptId)) {
      if (existing !== m.conceptId) return true;
    } else {
      if (typeof existing === 'string') return true;
      if (existing.property_id !== m.conceptId) return true;
      if ((existing.conversion_id ?? null) !== m.unitId) return true;
      const proc = procedureByColumn[m.columnName];
      if (proc) {
        if (!procedurePayloadMatches(m.details, proc)) return true;
      } else {
        if (Object.values(m.details).some(v => v !== null)) return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMappingsStep(datasetId?: string) {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isLoading: isIngestionLoading, updateFurthestStep } = useIngestionStatus();
  const hasTracked = useRef(false);
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

  const mergedMappings = useMemo(() => {
    if (isLoadingFiles || isLoadingExistingMappings) {
      return [];
    }
    if (!files) return existingMappings ?? [];
    // Merge detected mappings from all files with any existing mappings from the server.
    // Deep-clone to avoid mutating the React Query cache.
    const firstMapping = existingMappings && existingMappings.length > 0 ? structuredClone(existingMappings[0].data_mapping) : {};
    for (const file of files) {
      const detectedMapping = file.metadata?.detected_mapping ?? {};
      for (const [columnName, obj] of Object.entries(detectedMapping)) {
        if (!(columnName in firstMapping)) firstMapping[columnName] = obj;
      }
    }
    return [{ ...existingMappings?.[0], data_mapping: firstMapping }];
  }, [existingMappings, files, isLoadingExistingMappings, isLoadingFiles]);

  // Extract procedures from existing (loaded from the server) mappings, so we can fetch them and pre-populate the details fields.
  const proceduresInMapping = useMemo(() => {
    const dataMapping = mergedMappings?.[0]?.data_mapping ?? {};
    return Object.entries(dataMapping)
      .filter((entry): entry is [string, PropertyMapping] => typeof entry[1] !== 'string') // exlude metadata fields (they are string)
      .filter(([, v]) => !!v.procedure_id) // exlude mappings that don't have an associated procedure
      .map(([columnName, v]) => ({ columnName, procedureId: v.procedure_id! }));
  }, [mergedMappings]);

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

  const { data: techniques, isLoading: isLoadingTechniques } = useApiQuery<string[]>({
    endpoint: '/procedures/techniques',
    method: 'GET',
    queryKey: ['procedures', 'techniques'],
    enabled: true,
  });

  const isLoading =
    isLoadingFiles ||
    isLoadingSoilProperties ||
    isLoadingVocabulary ||
    isLoadingTechniques ||
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
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
    }
  }, [isImportingState, activeJobIds, jobsData, isIngestionLoading, datasetId, updateFurthestStep, navigate]);

  const geometryDetected = useMemo(() => {
    if (!files || files.length === 0) return undefined;
    return files[0].metadata?.geometry_detected === true;
  }, [files]);

  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // Initialise the column mapping table from the uploaded file columns, hydrating each row
  // with any previously saved mapping and procedure details.
  useEffect(() => {
    if (!files) return;
    const columnNames = [...new Set(files.flatMap(f => f.metadata?.field_names ?? []))];
    const existingDataMapping = mergedMappings?.[0]?.data_mapping ?? {};

    // Invert detected_fields ({ conceptCode → columnName }) into { columnName → conceptCode }
    // so we can look up the suggested concept for any unmapped column.
    const detectedFields = files[0]?.metadata?.detected_fields ?? {};
    const detectedConceptByColumn: Record<string, string> = {};
    for (const [conceptCode, columnName] of Object.entries(detectedFields)) {
      if (columnName) detectedConceptByColumn[columnName] = conceptCode;
    }

    setColumnMappings(
      columnNames.map(columnName => {
        const existing = existingDataMapping[columnName];
        if (!existing) {
          return { columnName, conceptId: detectedConceptByColumn[columnName] ?? null, unitId: null, details: { ...EMPTY_DETAILS } };
        }
        if (typeof existing === 'string') return { columnName, conceptId: existing, unitId: null, details: { ...EMPTY_DETAILS } };

        const proc = procedureByColumn[columnName];
        const details: RowDetails = proc
          ? {
              samplePretreatment: proc.sample_pretreatment ?? null,
              technique: proc.technique ?? null,
              laboratoryMethod: proc.laboratory_method ?? null,
              extractantConcentration: proc.extractant_concentration ?? null,
              extractionRatio: proc.extraction_ratio ?? null,
              extractionBase: proc.extraction_base ?? null,
              measurementProcedure: proc.measurement_procedure ?? null,
              limitOfDetection: proc.limit_of_detection ?? null,
            }
          : { ...EMPTY_DETAILS };

        return { columnName, conceptId: existing.property_id, unitId: existing.conversion_id ?? null, details };
      }),
    );
  }, [files, procedureByColumn, mergedMappings]);

  const detailOptions = useMemo((): DetailOptionMap => {
    const base: DetailOptionMap = {
      samplePretreatment: [],
      technique: [],
      laboratoryMethod: [],
      extractantConcentration: [],
      extractionRatio: [],
      extractionBase: [],
      measurementProcedure: [],
      limitOfDetection: [],
    };

    for (const item of vocabularyItems ?? []) {
      const key = VOCAB_CATEGORY_TO_KEY[item.category];
      if (key) base[key] = [...base[key], { code: item.name, name: item.name }];
    }

    base.technique = (techniques ?? []).map(t => ({
      code: t,
      name: t.charAt(0).toUpperCase() + t.slice(1),
    }));

    return base;
  }, [vocabularyItems, techniques]);

  // Unit options and sorted soil properties — depends only on API data, not user selections.
  const { soilPropertyOptions, unitOptionsByConcept } = useMemo(() => {
    const properties = soilProperties ?? [];
    const soilPropertyOptions = properties.map(p => ({ code: p.id, name: p.property_name })).sort((a, b) => a.name.localeCompare(b.name));
    const unitOptionsByConcept: Record<string, MenuOption[]> = {};
    for (const p of properties) {
      unitOptionsByConcept[p.id] = Object.entries(p.original_units_of_measurement ?? {}).map(([code, name]) => ({ code, name }));
    }
    return { soilPropertyOptions, unitOptionsByConcept };
  }, [soilProperties]);

  // Per-row concept options: metadata fields first (excluding those already selected by other rows),
  // then all soil properties. A row always sees its own current metadata selection so the user
  // can change or clear it.
  const conceptOptionsByColumn = useMemo((): Record<string, MenuOption[]> => {
    const usedMetadataCodes = new Set(
      columnMappings.filter(m => m.conceptId && METADATA_FIELD_CODES.has(m.conceptId)).map(m => m.conceptId!),
    );
    return Object.fromEntries(
      columnMappings.map(m => {
        const availableMetadata = METADATA_FIELD_OPTIONS.filter(o => !usedMetadataCodes.has(o.code) || m.conceptId === o.code);
        return [m.columnName, [...availableMetadata, ...soilPropertyOptions]];
      }),
    );
  }, [columnMappings, soilPropertyOptions]);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { mappedCount, unmappedCount } = useMemo(() => {
    let mapped = 0;
    for (const m of columnMappings) {
      if (m.conceptId !== null) mapped++;
    }
    return { mappedCount: mapped, unmappedCount: columnMappings.length - mapped };
  }, [columnMappings]);

  const geometryMessage = useMemo((): { message: string; type: 'info' | 'warning' } | null => {
    if (geometryDetected === undefined) return null;
    if (geometryDetected === true) return { message: t('datasets.mappings.geometry_detected'), type: 'info' };
    const hasGeometry = columnMappings.some(m => m.conceptId === 'geometry');
    const hasLatLon = columnMappings.some(m => m.conceptId === 'latitude') && columnMappings.some(m => m.conceptId === 'longitude');
    if (hasGeometry || hasLatLon) return null;
    return { message: t('datasets.mappings.geometry_not_detected'), type: 'warning' };
  }, [geometryDetected, columnMappings, t]);

  const depthConflictMessage = useMemo((): { message: string; type: 'warning' } | null => {
    const hasDepth = columnMappings.some(m => m.conceptId === 'depth');
    const hasRangeDepth = columnMappings.some(m => m.conceptId === 'min_depth' || m.conceptId === 'max_depth');
    if (hasDepth && hasRangeDepth) return { message: t('datasets.mappings.depth_conflict'), type: 'warning' };
    return null;
  }, [columnMappings, t]);

  const isContinueEnabled = useMemo(
    () => mappedCount > 0 && geometryDetected !== undefined && geometryMessage?.type !== 'warning' && depthConflictMessage === null,
    [mappedCount, geometryDetected, geometryMessage, depthConflictMessage],
  );

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
    const isStructural = conceptId !== null && METADATA_FIELD_CODES.has(conceptId);

    setColumnMappings(prev =>
      prev.map(m => {
        if (m.columnName !== columnName) return m;
        // Clear the unit whenever the concept is removed
        const unitId = conceptId === null ? null : m.unitId;
        // Clear detail fields when switching to a structural field — they don't apply
        const details = isStructural ? { ...EMPTY_DETAILS } : m.details;
        return { ...m, conceptId, unitId, details };
      }),
    );

    // Collapse the row when switching to a structural field
    if (isStructural) {
      setExpandedRows(prev => {
        const next = new Set(prev);
        next.delete(columnName);
        return next;
      });
    }
  }, []);

  const handleUnitChange = useCallback((columnName: string, value: string) => {
    setColumnMappings(prev => prev.map(m => (m.columnName === columnName ? { ...m, unitId: value || null } : m)));
  }, []);

  const handleDetailChange = useCallback((columnName: string, field: keyof RowDetails, value: string) => {
    setColumnMappings(prev =>
      prev.map(m => (m.columnName === columnName ? { ...m, details: { ...m.details, [field]: value || null } } : m)),
    );
  }, []);

  const save = useCallback(async () => {
    const procedureIds = await createMappingProcedures(columnMappings, procedureByColumn, createProcedure);
    const mappingResponse = await createMapping(buildDataMappingRequest(columnMappings, procedureIds));

    if (datasetId && datasetFileMappings?.length) {
      await Promise.all(
        datasetFileMappings.map(dfm =>
          updateDatasetFileMapping({ datasetId, datasetFileMappingId: dfm.id, mappingId: mappingResponse.id }),
        ),
      );
    }

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
  ]);

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/soil-data`);
  }, [navigate, datasetId]);

  const handleSaveAndContinueLater = useCallback(async () => {
    await save();
    navigate(ADMIN_PATHS.DATASETS);
  }, [save, navigate]);

  const handleContinue = useCallback(async () => {
    const changed = isMappingChanged(columnMappings, existingMappings?.[0]?.data_mapping, procedureByColumn);

    if (!changed && allFilesStaged) {
      navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
      return;
    }

    setIsImportingState(true);
    await save();
    const jobs = await Promise.all(datasetFileMappings!.map(dfm => createJob({ type: 'file-to-db', file_id: dfm.fileID })));
    setActiveJobIds(jobs.map(j => j.id));
  }, [columnMappings, existingMappings, procedureByColumn, allFilesStaged, save, navigate, datasetId, datasetFileMappings, createJob]);

  return {
    isLoading,
    isImporting,
    geometryMessage,
    depthConflictMessage,
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
    handleDetailChange,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
  };
}
