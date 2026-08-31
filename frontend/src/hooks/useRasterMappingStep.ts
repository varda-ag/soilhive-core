import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useApiQuery } from './useApiQuery';
import { ADMIN_PATHS } from '../configuration/admin';
import { useDatasetIngestionState } from './useDatasetIngestionState';
import { useProcedureByColumn } from './useProcedureByColumn';
import { useSoilPropertyOptions } from './useSoilPropertyOptions';
import { GISDataType } from 'types/backend';
import type {
  FileDescriptor,
  RasterFileDescriptorMetadata,
  VocabularyItem,
  PropertyMapping,
  DataMappingRequest,
  DataMappingObject,
  ProcedurePayload,
  ProcedureResponse,
} from 'types/backend';
import type { MenuOption } from 'components/UI/types';

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

const isRasterFile = (file: FileDescriptor): file is FileDescriptor & { metadata: RasterFileDescriptorMetadata } =>
  !!file.metadata && !!file.metadata.is_raster;

// One row per raster band, named after the file it came from — a raster with multiple bands
// gets one row per band (e.g. "file_bulk_raster.tif (band 1)"), while a single-band raster is
// just named after the file, with no band number. bandKey — the key used to serialize into a
// file's data_mapping — is the band's 1-based band_number (1, 2, 3, ...), matching the backend's
// convention (GDAL band numbering; see backend/src/interfaces/RasterMapping.ts).
// Files that aren't rasters (e.g. non-spatial additional resources) are excluded.
function buildColumns(files: FileDescriptor[]): { columnName: string; fileId: string; bandKey: number }[] {
  return files.flatMap(f => {
    if (!isRasterFile(f)) return [];
    const bands = f.metadata.raster_bands;
    if (bands.length <= 1) {
      return [{ columnName: f.name, fileId: f.id, bandKey: bands[0]?.band_number ?? 1 }];
    }
    return bands.map(b => ({ columnName: `${f.name} (band ${b.band_number})`, fileId: f.id, bandKey: b.band_number }));
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

// Builds one mapping payload per file, keyed by the band's 1-based band_number within that file
// (not by column name) — a file's mapping only needs to distinguish its own bands, so the key
// is just e.g. "1", "2". The value is an object that may include the concept id, unit
// conversion id, and procedure id.
function buildDataMappingRequestsByFile(
  mappings: ColumnMapping[],
  procedureIds: Record<string, string>,
): Record<string, DataMappingRequest> {
  const requestsByFile: Record<string, DataMappingRequest> = {};
  for (const m of mappings) {
    // Seed every file with an entry (even if empty) before checking conceptId — a file with none
    // of its bands mapped must still get a request here, or save() will skip it and its
    // dataset-file-mapping will end up with no mappingId at all. RasterLoader's prepareStagedBands
    // throws RL_MAPPING_NOT_CONFIGURED (failing the whole raster-load job) for a file with no
    // data_mapping_id, but skips gracefully over one pointed at an empty mapping — and there's no
    // way to PATCH a mappingId back to "unset", so every file must always point at some mapping.
    const request = (requestsByFile[m.fileId] ??= {});
    if (!m.conceptId) continue;
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

type DepthErrorType = 'missing' | 'non_numeric' | 'range';

function getDepthError(minDepth: string | null, maxDepth: string | null): DepthErrorType | null {
  if (!minDepth || !maxDepth) return 'missing';
  const min = Number(minDepth);
  const max = Number(maxDepth);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 'non_numeric';
  if (min >= max) return 'range';
  return null;
}

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
  const { t } = useTranslation('admin');
  const {
    navigate,
    queryClient,
    resetChanges,
    showLoadingPanel,
    setShowLoadingPanel,
    createProcedure,
    createMapping,
    updateDatasetFileMapping,
    createJob,
    setIsImportingState,
    setActiveJobIds,
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
  } = useDatasetIngestionState(datasetId);

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

  const { procedureByColumn, isLoadingProcedures } = useProcedureByColumn(proceduresInMapping);

  const { soilPropertyOptions, isLoadingSoilProperties, unitOptionsByConcept } = useSoilPropertyOptions();

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

  // Per-row concept options: every row offers the same list of soil properties.
  const conceptOptionsByColumn = useMemo((): Record<string, MenuOption[]> => {
    return Object.fromEntries(columnMappings.map(m => [m.columnName, soilPropertyOptions]));
  }, [columnMappings, soilPropertyOptions]);

  const { mappedCount, unmappedCount } = useMemo(() => {
    const mapped = columnMappings.filter(m => m.conceptId !== null).length;
    return { mappedCount: mapped, unmappedCount: columnMappings.length - mapped };
  }, [columnMappings]);

  const invalidDepthColumns = useMemo(() => {
    const columns = new Set<string>();
    for (const m of columnMappings) {
      if (m.conceptId === null) continue;
      if (getDepthError(m.minDepth, m.maxDepth) !== null) columns.add(m.columnName);
    }
    return columns;
  }, [columnMappings]);

  const depthValidationMessage = useMemo((): { message: string; type: 'error' } | null => {
    let worstError: DepthErrorType | null = null;
    for (const m of columnMappings) {
      if (m.conceptId === null) continue;
      const error = getDepthError(m.minDepth, m.maxDepth);
      if (error === 'missing') {
        worstError = 'missing';
        break;
      }
      if (error === 'non_numeric' && worstError !== 'non_numeric') worstError = 'non_numeric';
      if (error === 'range' && worstError === null) worstError = 'range';
    }

    if (worstError === 'missing') return { message: t('datasets.mappings.depth_required'), type: 'error' };
    if (worstError === 'non_numeric') return { message: t('datasets.mappings.depth_must_be_numeric'), type: 'error' };
    if (worstError === 'range') return { message: t('datasets.mappings.depth_range_invalid'), type: 'error' };
    return null;
  }, [columnMappings, t]);

  const isContinueEnabled = useMemo(() => mappedCount > 0 && invalidDepthColumns.size === 0, [mappedCount, invalidDepthColumns]);

  // Disabled while loading: columnMappings is empty until the initial fetches
  // resolve, so saving early would persist an empty mapping over any saved data.
  const isSaveEnabled = useMemo(() => !isLoading, [isLoading]);

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

  const handleSaveAndContinueLater = useCallback(() => saveAndContinueLater(save), [saveAndContinueLater, save]);

  const handleContinue = useCallback(async () => {
    const changed = isMappingChanged(columnMappings, dataMappingByFileId, procedureByColumn);
    const isRaster = datasetGisDataType === GISDataType.RASTER;

    // Always reconcile mappingId/data_mapping the same way handleSaveAndContinueLater does —
    // an unmapped file must still end up pointed at an empty mapping (see save()'s seeding
    // logic), even on the "nothing changed" path below. "Changed" only decides whether it's
    // worth kicking off a new raster-load job.
    setIsImportingState(true);
    // Raster loading happens as a background job, so tell the user it has started right away
    // instead of showing the "mapping fields" spinner for the whole save + job duration.
    if (isRaster) setShowLoadingPanel(true);
    await save();

    if (!changed && allFilesStaged) {
      setIsImportingState(false);
      if (!isRaster) {
        navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
      }
      return;
    }

    // Unlike the vector flow's file-to-db job, raster-load is scoped to the whole dataset
    // (not per file), so we fire a single job and track it as the sole active job id.
    const job = await createJob({ type: 'raster-load', dataset_id: datasetId });
    setActiveJobIds([job.id]);
  }, [
    columnMappings,
    dataMappingByFileId,
    procedureByColumn,
    allFilesStaged,
    save,
    navigate,
    datasetId,
    createJob,
    datasetGisDataType,
    setShowLoadingPanel,
    setIsImportingState,
    setActiveJobIds,
  ]);

  return {
    isLoading,
    datasetName,
    datasetGisDataType,
    isImporting,
    showLoadingPanel,
    isSaveEnabled,
    isContinueEnabled,
    columnMappings,
    conceptOptionsByColumn,
    unitOptionsByConcept,
    detailOptions,
    mappedCount,
    unmappedCount,
    invalidDepthColumns,
    depthValidationMessage,
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
