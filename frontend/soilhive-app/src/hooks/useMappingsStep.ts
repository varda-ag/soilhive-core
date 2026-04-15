import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useApiQuery } from './useApiQuery';
import { useSoilProperties } from './useSoilProperties';
import { ADMIN_PATHS } from '../configuration/admin';
import type { FileDescriptor } from 'types/backend';
import type { MenuOption } from 'types/components';

// Types scoped to the fake-data UI layer (backend shape wired later)
export interface RowDetails {
  samplePretreatment: string | null;
  technique: string | null;
  extractantFormulation: string | null;
  extractantConcentration: string | null;
  attractionRatio: string | null;
  extractionBase: string | null;
  instrument: string | null;
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

const DETECTABLE_FIELD_OPTIONS: MenuOption[] = [
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

const UNIT_OPTIONS: MenuOption[] = [
  { code: 'percent', name: '%' },
  { code: 'gkg', name: 'g/kg' },
  { code: 'mgkg', name: 'mg/kg' },
  { code: 'no_unit', name: 'No unit' },
  { code: 'cmolkg', name: 'cmol/kg' },
];

const DETAIL_OPTIONS: DetailOptionMap = {
  samplePretreatment: [
    { code: 'air_dried', name: 'Air dried' },
    { code: 'oven_dried', name: 'Oven dried' },
    { code: 'field_moist', name: 'Field moist' },
  ],
  technique: [
    { code: 'lab_procedure', name: 'Lab procedure' },
    { code: 'field_measurement', name: 'Field measurement' },
    { code: 'remote_sensing', name: 'Remote sensing' },
  ],
  extractantFormulation: [
    { code: 'water', name: 'Water' },
    { code: 'kcl', name: 'KCl' },
    { code: 'cacl2', name: 'CaCl2' },
  ],
  extractantConcentration: [
    { code: '0_01m', name: '0.01 M' },
    { code: '0_1m', name: '0.1 M' },
    { code: '1m', name: '1 M' },
  ],
  attractionRatio: [
    { code: '1_2', name: '1:2' },
    { code: '1_5', name: '1:5' },
    { code: '1_10', name: '1:10' },
  ],
  extractionBase: [
    { code: 'dry_weight', name: 'Dry weight' },
    { code: 'wet_weight', name: 'Wet weight' },
    { code: 'volume', name: 'Volume' },
  ],
  instrument: [
    { code: 'spectrophotometer', name: 'Spectrophotometer' },
    { code: 'icp_oes', name: 'ICP-OES' },
    { code: 'gc', name: 'Gas chromatograph' },
  ],
  limitOfDetection: [
    { code: '0_01', name: '0.01' },
    { code: '0_1', name: '0.1' },
    { code: '1', name: '1.0' },
  ],
};

const EMPTY_DETAILS: RowDetails = {
  samplePretreatment: null,
  technique: null,
  extractantFormulation: null,
  extractantConcentration: null,
  attractionRatio: null,
  extractionBase: null,
  instrument: null,
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

  const isLoading = isLoadingFiles || isLoadingSoilProperties;

  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);

  useEffect(() => {
    if (!files) return;
    const columnNames = [...new Set(files.flatMap(f => f.metadata?.field_names ?? []))];
    setColumnMappings(columnNames.map(columnName => ({ columnName, conceptId: null, unitId: null, details: { ...EMPTY_DETAILS } })));
  }, [files]);

  // Detectable structural fields first, then soil properties sorted alphabetically.
  const conceptOptions = useMemo(() => {
    const soilPropertyOptions = (soilProperties ?? [])
      .map(p => ({ code: p.id, name: p.property_name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...DETECTABLE_FIELD_OPTIONS, ...soilPropertyOptions];
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
    setColumnMappings(prev =>
      prev.map(m => {
        if (m.columnName !== columnName) return m;
        const conceptId = value || null;
        // Clear the unit whenever the concept is removed
        const unitId = conceptId === null ? null : m.unitId;
        return { ...m, conceptId, unitId };
      }),
    );
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
    unitOptions: UNIT_OPTIONS,
    detailOptions: DETAIL_OPTIONS,
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
