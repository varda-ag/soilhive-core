import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { useApiQueries } from './useApiQueries';
import { useCreateProcedureMutation } from './useCreateProcedureMutation';
import { useCreateMappingsMutation } from './useCreateMappingsMutation';
import { useUpdateDatasetFileMappingMutation } from './useDatasetMutation';
import { useSoilProperties } from './useSoilProperties';
import { ADMIN_PATHS } from '../configuration/admin';
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

// Creates a procedure record for each mapped column that has at least one detail field filled in.
async function createMappingProcedures(
  mappings: ColumnMapping[],
  createProcedure: (payload: ProcedurePayload) => Promise<ProcedureResponse>,
): Promise<Record<string, string>> {
  const procedureIds: Record<string, string> = {};
  for (const mapping of mappings) {
    if (!mapping.conceptId) continue;
    if (!Object.values(mapping.details).some(v => v !== null)) continue;
    const procedure = await createProcedure(toProcedurePayload(mapping.details));
    procedureIds[mapping.columnName] = procedure.id;
  }
  return procedureIds;
}

// Builds the mapping payload. For structural fields, this is just the concept id. For soil properties, it's an object that may include the concept id, unit conversion id, and procedure id.
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
// Hook
// ---------------------------------------------------------------------------

export function useMappingsStep(datasetId?: string) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { mutateAsync: createProcedure } = useCreateProcedureMutation();
  const { mutateAsync: createMapping } = useCreateMappingsMutation();
  const { mutateAsync: updateDatasetFileMapping } = useUpdateDatasetFileMappingMutation();

  const { data: files, isLoading: isLoadingFiles } = useApiQuery<FileDescriptor[]>({
    endpoint: `/datasets/${datasetId}/files`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'files'],
    enabled: !!datasetId,
  });

  const { data: datasetFileMappings } = useApiQuery<DatasetFileMappingResponse[]>({
    endpoint: `/datasets/${datasetId}/dataset-file-mapping`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'dataset-file-mapping'],
    enabled: !!datasetId,
  });

  const { data: existingMappings, isLoading: isLoadingExistingMappings } = useApiQuery<DataMappingResponse[]>({
    endpoint: `/datasets/${datasetId}/mappings`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'mappings'],
    enabled: !!datasetId,
  });

  // Extract procedures from existing (loaded from the server) mappings, so we can fetch them and pre-populate the details fields.
  const proceduresInMapping = useMemo(() => {
    const dataMapping = existingMappings?.[0]?.data_mapping ?? {};
    return Object.entries(dataMapping)
      .filter((entry): entry is [string, PropertyMapping] => typeof entry[1] !== 'string') // exlude metadata fields (they are string)
      .filter(([, v]) => !!v.procedure_id) // exlude mappings that don't have an associated procedure
      .map(([columnName, v]) => ({ columnName, procedureId: v.procedure_id! }));
  }, [existingMappings]);

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
    isLoadingProcedures;

  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  // Initialise the column mapping table from the uploaded file columns, hydrating each row
  // with any previously saved mapping and procedure details.
  useEffect(() => {
    if (!files) return;
    const columnNames = [...new Set(files.flatMap(f => f.metadata?.field_names ?? []))];
    const existingDataMapping = existingMappings?.[0]?.data_mapping ?? {};

    setColumnMappings(
      columnNames.map(columnName => {
        const existing = existingDataMapping[columnName];
        if (!existing) return { columnName, conceptId: null, unitId: null, details: { ...EMPTY_DETAILS } };
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
  }, [files, existingMappings, procedureByColumn]);

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

  // Metadata fields first, then soil properties sorted alphabetically.
  // Unit options are keyed by concept id — only soil properties carry allowed units.
  const { conceptOptions, unitOptionsByConcept } = useMemo(() => {
    const properties = soilProperties ?? [];
    const soilPropertyOptions = properties.map(p => ({ code: p.id, name: p.property_name })).sort((a, b) => a.name.localeCompare(b.name));
    const unitOptionsByConcept: Record<string, MenuOption[]> = {};
    for (const p of properties) {
      unitOptionsByConcept[p.id] = p.original_units_of_measurement?.map(u => ({ code: u, name: u }));
    }
    return { conceptOptions: [...METADATA_FIELD_OPTIONS, ...soilPropertyOptions], unitOptionsByConcept };
  }, [soilProperties]);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { mappedCount, unmappedCount } = useMemo(() => {
    let mapped = 0;
    for (const m of columnMappings) {
      if (m.conceptId !== null) mapped++;
    }
    return { mappedCount: mapped, unmappedCount: columnMappings.length - mapped };
  }, [columnMappings]);

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
    const procedureIds = await createMappingProcedures(columnMappings, createProcedure);
    const mappingResponse = await createMapping(buildDataMappingRequest(columnMappings, procedureIds));

    if (datasetId && datasetFileMappings?.length) {
      await Promise.all(
        datasetFileMappings.map(dfm =>
          updateDatasetFileMapping({ datasetId, datasetFileMappingId: dfm.id, mappingId: mappingResponse.id }),
        ),
      );
    }

    await queryClient.invalidateQueries({ queryKey: ['datasets', datasetId, 'mappings'] });
  }, [columnMappings, createProcedure, createMapping, updateDatasetFileMapping, datasetId, datasetFileMappings, queryClient]);

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/soil-data`);
  }, [navigate, datasetId]);

  const handleSaveAndContinueLater = useCallback(async () => {
    await save();
    navigate(ADMIN_PATHS.DATASETS);
  }, [save, navigate]);

  const handleContinue = useCallback(async () => {
    await save();
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
  }, [save, navigate, datasetId]);

  return {
    isLoading,
    columnMappings,
    conceptOptions,
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
