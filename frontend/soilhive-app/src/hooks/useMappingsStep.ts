import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useApiQuery } from './useApiQuery';
import { useSoilProperties } from './useSoilProperties';
import { ADMIN_PATHS } from '../configuration/admin';
import type { FileDescriptor, VocabularyItem } from 'types/backend';
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

// ---------------------------------------------------------------------------
// Concept options — detectable structural fields (hardcoded: fixed pipeline enum)
// followed by soil properties fetched from the API.
// ---------------------------------------------------------------------------

const STRUCTURAL_FIELD_OPTIONS: MenuOption[] = [
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

// Exported so consumers can check whether a concept code is a structural field
// without re-deriving it from STRUCTURAL_FIELD_OPTIONS.
export const STRUCTURAL_FIELD_CODES = new Set(STRUCTURAL_FIELD_OPTIONS.map(o => o.code));

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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMappingsStep(datasetId?: string) {
  const navigate = useNavigate();

  const { data: files, isLoading: isLoadingFiles } = useApiQuery<FileDescriptor[]>({
    endpoint: `/datasets/${datasetId}/files`,
    method: 'GET',
    queryKey: ['datasets', datasetId, 'files'],
    enabled: !!datasetId,
  });

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

  const isLoading = isLoadingFiles || isLoadingSoilProperties || isLoadingVocabulary || isLoadingTechniques;

  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  useEffect(() => {
    if (!files) return;
    const columnNames = [...new Set(files.flatMap(f => f.metadata?.field_names ?? []))];
    setColumnMappings(columnNames.map(columnName => ({ columnName, conceptId: null, unitId: null, details: { ...EMPTY_DETAILS } })));
  }, [files]);

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
      if (key) base[key] = [...base[key], { code: item.id, name: item.name }];
    }

    base.technique = (techniques ?? []).map(t => ({
      code: t,
      name: t.charAt(0).toUpperCase() + t.slice(1),
    }));

    return base;
  }, [vocabularyItems, techniques]);

  // Detectable structural fields first, then soil properties sorted alphabetically.
  // Unit options are keyed by concept id — only soil properties carry allowed units.
  const { conceptOptions, unitOptionsByConcept } = useMemo(() => {
    const properties = soilProperties ?? [];
    const soilPropertyOptions = properties.map(p => ({ code: p.id, name: p.property_name })).sort((a, b) => a.name.localeCompare(b.name));
    const unitOptionsByConcept: Record<string, MenuOption[]> = {};
    for (const p of properties) {
      unitOptionsByConcept[p.id] = p.original_units_of_measurement?.map(u => ({ code: u, name: u }));
    }
    return { conceptOptions: [...STRUCTURAL_FIELD_OPTIONS, ...soilPropertyOptions], unitOptionsByConcept };
  }, [soilProperties]);

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const mappedCount = useMemo(() => columnMappings.filter(m => m.conceptId !== null).length, [columnMappings]);

  const unmappedCount = useMemo(() => columnMappings.filter(m => m.conceptId === null).length, [columnMappings]);

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

  const isUnitEnabled = useCallback(
    (columnName: string) => columnMappings.find(m => m.columnName === columnName)?.conceptId !== null,
    [columnMappings],
  );

  const handleConceptChange = useCallback((columnName: string, value: string) => {
    const conceptId = value || null;
    const isStructural = conceptId !== null && STRUCTURAL_FIELD_CODES.has(conceptId);

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

  const handlePrevious = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/soil-data`);
  }, [navigate, datasetId]);

  const handleSaveAndContinueLater = useCallback(() => {
    navigate(ADMIN_PATHS.DATASETS);
  }, [navigate]);

  const handleContinue = useCallback(() => {
    navigate(`${ADMIN_PATHS.DATASETS}/edit/${datasetId}/preview`);
  }, [navigate, datasetId]);

  return {
    isLoading,
    columnMappings,
    conceptOptions,
    unitOptionsByConcept,
    detailOptions,
    mappedCount,
    unmappedCount,
    expandedRows,
    isUnitEnabled,
    toggleRow,
    handleConceptChange,
    handleUnitChange,
    handleDetailChange,
    handlePrevious,
    handleSaveAndContinueLater,
    handleContinue,
  };
}
