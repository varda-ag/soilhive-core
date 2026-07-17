import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useMappingsStep } from 'hooks/useMappingsStep';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSoilProperties } from 'hooks/useSoilProperties';
import { useCreateProcedureMutation } from 'hooks/useCreateProcedureMutation';
import { useCreateMappingsMutation } from 'hooks/useCreateMappingsMutation';
import { useCreateJobMutation, useJobsQueries } from 'hooks/useJobsApi';
import useIngestionFlow from 'hooks/useIngestionFlow';
import { useDataset } from 'hooks/useDatasets';

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

jest.mock('hooks/useApiQueries', () => ({
  useApiQueries: jest.fn(() => []),
}));

jest.mock('hooks/useSoilProperties', () => ({
  useSoilProperties: jest.fn(),
}));

jest.mock('hooks/useCreateProcedureMutation', () => ({
  useCreateProcedureMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock('hooks/useCreateMappingsMutation', () => ({
  useCreateMappingsMutation: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({ id: 'mapping-1', data_mapping: {} }),
  })),
}));

jest.mock('hooks/useIngestionStatus', () => ({
  useIngestionStatus: jest.fn(() => ({
    isLoading: false,
    getFurthestStep: jest.fn(() => 'general-info'),
    updateFurthestStep: jest.fn(),
    clearDatasetStatus: jest.fn(),
  })),
}));

jest.mock('hooks/useIngestionFlow', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('hooks/useDatasetMutation', () => ({
  useUpdateDatasetFileMappingMutation: jest.fn(() => ({ mutateAsync: jest.fn() })),
}));

jest.mock('hooks/useJobsApi', () => ({
  useCreateJobMutation: jest.fn(() => ({ mutateAsync: jest.fn().mockResolvedValue({ id: 'job-1' }) })),
  useJobsQueries: jest.fn(() => []),
}));

const mockQueryClient = {
  invalidateQueries: jest.fn().mockResolvedValue(undefined),
};

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => mockQueryClient),
}));

jest.mock('hooks/useDatasets', () => ({ useDataset: jest.fn() }));

const mockUseApiQuery = useApiQuery as jest.Mock;
const mockUseSoilProperties = useSoilProperties as jest.Mock;

const mockMarkAsChanged = jest.fn();
const mockResetChanges = jest.fn();

beforeEach(() => {
  mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: false, dataUpdatedAt: 0 });
  mockUseSoilProperties.mockReturnValue({ data: undefined, isLoading: false });
  mockQueryClient.invalidateQueries.mockClear();
  (useIngestionFlow as jest.Mock).mockReturnValue({ markAsChanged: mockMarkAsChanged, resetChanges: mockResetChanges });
  (useDataset as jest.Mock).mockReturnValue({ data: { name: 'Mock-dataset' } });
});

const defaultDatasetFileMappings = [{ id: 'dfm-1', fileID: 'file-1' }];

function setupWithColumns(columns: string[], detectedFields?: Record<string, string>, geometryDetected?: boolean) {
  // Stable reference — new array per call would re-trigger the columnMappings useEffect on every render.
  const filesData = [
    {
      metadata: {
        field_names: columns,
        ...(detectedFields ? { detected_fields: detectedFields } : {}),
        ...(geometryDetected !== undefined ? { geometry_detected: geometryDetected } : {}),
      },
    },
  ];
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
    if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

function setupWithEmptyFiles() {
  const filesData: never[] = [];
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
    if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

function setupWithColumnsAndExistingMapping(
  columns: string[],
  dataMapping: Record<string, unknown>,
  detectedFields?: Record<string, string>,
) {
  // Stable references — new arrays on every render would re-trigger the columnMappings useEffect.
  const filesData = [{ metadata: { field_names: columns, ...(detectedFields ? { detected_fields: detectedFields } : {}) } }];
  const mappingsData = [{ data_mapping: dataMapping }];
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
    if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
    if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

function setupWithDetectedMapping(columns: string[], dataMapping: Record<string, unknown>, detectedMapping: Record<string, unknown>) {
  // Stable references — new arrays on every render would re-trigger the columnMappings useEffect.
  const filesData = [{ metadata: { field_names: columns, detected_mapping: detectedMapping } }];
  const mappingsData = [{ data_mapping: dataMapping }];
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
    if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
    if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

function setupWithFileStatuses(statuses: string[], dataUpdatedAt = 0) {
  const filesData = statuses.map(status => ({
    status,
    metadata: { field_names: ['col1'], geometry_detected: true },
  }));
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false, dataUpdatedAt };
    if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

describe('useMappingsStep', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    mockNavigate.mockClear();
  });

  describe('initial state', () => {
    it('has no expanded rows', () => {
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.expandedRows.size).toBe(0);
    });
  });

  describe('navigation', () => {
    it('handlePrevious navigates to the soil-data step', () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handlePrevious();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/soil-data');
    });

    it('handleContinue navigates to the preview step when files are already uploaded and mapping is unchanged', async () => {
      // Fast path: all files STAGED + no mapping change → navigate immediately.
      const filesData = [{ metadata: { field_names: [] }, status: 'STAGED' }];
      const mappingsData = [{ data_mapping: {} }];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('handleSaveAndContinueLater navigates to the datasets list', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleSaveAndContinueLater();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets');
    });

    it('handleContinue creates a file-to-db job for each dataset-file-mapping when mapping has changed', async () => {
      // No existing mapping → isMappingChanged returns true → normal path (save + fire jobs).
      setupWithColumns(['col1']);
      const mockCreateJob = jest.fn().mockResolvedValue({ id: 'job-1' });
      (useCreateJobMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateJob });
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateJob).toHaveBeenCalledWith({ dataset_id: '42', type: 'file-to-db', file_id: 'file-1' });
    });

    it('handleContinue creates jobs when files are not yet STAGED even if mapping is unchanged', async () => {
      // Files still PENDING → allFilesUploaded=false → fast-path blocked → jobs must fire.
      const filesData = [{ status: 'PENDING', metadata: { field_names: [] } }];
      const mappingsData = [{ data_mapping: {} }];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
        if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const mockCreateJob = jest.fn().mockResolvedValue({ id: 'job-1' });
      (useCreateJobMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateJob });
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateJob).toHaveBeenCalledWith({ dataset_id: '42', type: 'file-to-db', file_id: 'file-1' });
    });
  });

  describe('isImporting', () => {
    it('is false when no file is ONGOING and handleContinue has not been called', () => {
      setupWithFileStatuses(['PENDING']);
      const { result } = renderHook(() => useMappingsStep('42'));
      expect(result.current.isImporting).toBe(false);
    });

    it('is true when at least one file has ONGOING status', () => {
      setupWithFileStatuses(['ONGOING']);
      const { result } = renderHook(() => useMappingsStep('42'));
      expect(result.current.isImporting).toBe(true);
    });

    it('is true immediately after handleContinue fires before server confirms', async () => {
      setupWithFileStatuses(['PENDING']);
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(result.current.isImporting).toBe(true);
    });
  });

  describe('auto-redirect', () => {
    it('redirects to preview once all jobs are completed after handleContinue', async () => {
      setupWithFileStatuses(['PENDING']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'completed' } })));
      const { result } = renderHook(() => useMappingsStep('42'));

      await act(async () => {
        await result.current.handleContinue();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('does not redirect when handleContinue was not called (no active jobs)', async () => {
      setupWithFileStatuses(['STAGED']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'completed' } })));
      renderHook(() => useMappingsStep('42'));
      await act(async () => {});
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not redirect while jobs are still running', async () => {
      setupWithFileStatuses(['PENDING']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'running' } })));
      const { result } = renderHook(() => useMappingsStep('42'));

      await act(async () => {
        await result.current.handleContinue();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not redirect when job query has not yet resolved', async () => {
      setupWithFileStatuses(['PENDING']);
      // data is undefined — filtered out of jobsData, so jobsData.length < activeJobIds.length
      (useJobsQueries as jest.Mock).mockImplementation(() => [{ data: undefined }]);
      const { result } = renderHook(() => useMappingsStep('42'));

      await act(async () => {
        await result.current.handleContinue();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('resets importing state when a job fails without navigating', async () => {
      setupWithFileStatuses(['PENDING']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'failed' } })));
      const { result } = renderHook(() => useMappingsStep('42'));

      await act(async () => {
        await result.current.handleContinue();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
      expect(result.current.isImporting).toBe(false);
    });
  });

  describe('conceptOptionsByColumn', () => {
    it('always includes the hardcoded metadata field options for each column', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useMappingsStep('1'));
      const codes = result.current.conceptOptionsByColumn['col1'].map(o => o.code);
      expect(codes).toContain('geometry');
      expect(codes).toContain('latitude');
      expect(codes).toContain('longitude');
      expect(codes).toContain('sampling_date');
      expect(codes).toContain('license');
    });

    it('appends soil properties sorted alphabetically after the metadata fields', () => {
      mockUseSoilProperties.mockReturnValue({
        data: [
          { id: 'p1', property_name: 'Zinc', property_acronym: 'Zn', category_id: 'c1', original_units_of_measurement: {} },
          { id: 'p2', property_name: 'Aluminium', property_acronym: 'Al', category_id: 'c1', original_units_of_measurement: {} },
        ],
        isLoading: false,
      });
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useMappingsStep('1'));
      const options = result.current.conceptOptionsByColumn['col1'];
      const metadataCount = 9; // METADATA_FIELD_OPTIONS length
      expect(options[metadataCount]).toEqual({ code: 'p2', name: 'Aluminium' });
      expect(options[metadataCount + 1]).toEqual({ code: 'p1', name: 'Zinc' });
    });

    it('hides a metadata option from other rows once it is selected by one row', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'geometry');
      });
      expect(result.current.conceptOptionsByColumn['col2'].map(o => o.code)).not.toContain('geometry');
    });

    it('keeps the metadata option visible in the row that owns it', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'geometry');
      });
      expect(result.current.conceptOptionsByColumn['col1'].map(o => o.code)).toContain('geometry');
    });

    it('restores a metadata option to all rows when its owning row is cleared', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'geometry');
      });
      act(() => {
        result.current.handleConceptChange('col1', '');
      });
      expect(result.current.conceptOptionsByColumn['col2'].map(o => o.code)).toContain('geometry');
    });
  });

  describe('mergedMappings', () => {
    it('adds new properties from detected_mapping that are absent from existingMappings', () => {
      setupWithDetectedMapping(['col1', 'col2'], { col1: 'geometry' }, { col2: { property_id: 'soil-ph' } });
      const { result } = renderHook(() => useMappingsStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['col2'].conceptId).toBe('soil-ph');
    });

    it('does not overwrite existing mapping entries with detected_mapping values', () => {
      setupWithDetectedMapping(['col1'], { col1: 'geometry' }, { col1: { property_id: 'soil-ph' } });
      const { result } = renderHook(() => useMappingsStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['col1'].conceptId).toBe('geometry');
    });

    it('adds string metadata entries from detected_mapping', () => {
      setupWithDetectedMapping(['col1', 'col2'], { col1: 'geometry' }, { col2: 'latitude' });
      const { result } = renderHook(() => useMappingsStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['col2'].conceptId).toBe('latitude');
    });
  });

  describe('detected_fields pre-population', () => {
    it('pre-populates conceptId from detected_fields when there is no existing mapping', () => {
      setupWithColumns(['lat', 'lon', 'date'], { latitude: 'lat', longitude: 'lon', sampling_date: 'date' });
      const { result } = renderHook(() => useMappingsStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['lat'].conceptId).toBe('latitude');
      expect(byName['lon'].conceptId).toBe('longitude');
      expect(byName['date'].conceptId).toBe('sampling_date');
    });

    it('leaves conceptId null for columns not present in detected_fields', () => {
      setupWithColumns(['lat', 'notes'], { latitude: 'lat' });
      const { result } = renderHook(() => useMappingsStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['notes'].conceptId).toBeNull();
    });

    it('uses detected_fields for columns not in the existing mapping, but existing entries always win', () => {
      setupWithColumnsAndExistingMapping(['lat', 'lon'], { lat: 'geometry' }, { latitude: 'lat', longitude: 'lon' });
      const { result } = renderHook(() => useMappingsStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      // 'lat' is in the existing mapping — its value wins over detected_fields
      expect(byName['lat'].conceptId).toBe('geometry');
      // 'lon' has no existing mapping entry — detected_fields SHOULD apply
      expect(byName['lon'].conceptId).toBe('longitude');
    });
  });

  describe('geometryMessage', () => {
    it('is null when files are not loaded', () => {
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.geometryMessage).toBeNull();
    });

    it('is null when files array is empty', () => {
      setupWithEmptyFiles();
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.geometryMessage).toBeNull();
    });

    it('is type info when geometry_detected is true', () => {
      setupWithColumns(['col1'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.geometryMessage?.type).toBe('info');
    });

    it('is type warning when geometry_detected is false and no geometry/lat+lon are mapped', () => {
      setupWithColumns(['col1'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.geometryMessage?.type).toBe('warning');
    });

    it('is null when geometry_detected is false but geometry is mapped', () => {
      setupWithColumns(['geom'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('geom', 'geometry');
      });
      expect(result.current.geometryMessage).toBeNull();
    });

    it('is null when geometry_detected is false but both lat and lon are mapped', () => {
      setupWithColumns(['lat', 'lon'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('lat', 'latitude');
        result.current.handleConceptChange('lon', 'longitude');
      });
      expect(result.current.geometryMessage).toBeNull();
    });

    it('remains warning when geometry_detected is false and only one of lat/lon is mapped', () => {
      setupWithColumns(['lat', 'lon'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('lat', 'latitude');
      });
      expect(result.current.geometryMessage?.type).toBe('warning');
    });

    it.only('is warning when both geometry and lat/lon are mapped', () => {
      setupWithColumns(['lat', 'lon', 'other'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('lat', 'latitude');
        result.current.handleConceptChange('lon', 'longitude');
        result.current.handleConceptChange('other', 'geometry');
      });
      expect(result.current.geometryMessage?.type).toBe('warning');
    });
  });

  describe('isContinueEnabled', () => {
    it('is false while files are still loading (geometryDetected undefined)', () => {
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when files array is empty', () => {
      setupWithEmptyFiles();
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when geometry_detected is false and nothing is mapped', () => {
      setupWithColumns(['col1'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when geometry is detected but no columns are mapped', () => {
      setupWithColumns(['col1'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is true when geometry is detected and at least one soil property is mapped', () => {
      setupWithColumns(['col1'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
      });
      expect(result.current.isContinueEnabled).toBe(true);
    });

    it('is false when geometry is detected but only metadata columns are mapped (no soil property)', () => {
      setupWithColumns(['col1'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'sampling_date');
      });
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is true when geometry_detected is false but geometry is manually mapped and a soil property is mapped', () => {
      setupWithColumns(['geom', 'ph'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('geom', 'geometry');
        result.current.handleConceptChange('ph', 'ph');
      });
      expect(result.current.isContinueEnabled).toBe(true);
    });

    it('is true when geometry_detected is false but both lat and lon are mapped and a soil property is mapped', () => {
      setupWithColumns(['lat', 'lon', 'ph'], undefined, false);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('lat', 'latitude');
        result.current.handleConceptChange('lon', 'longitude');
        result.current.handleConceptChange('ph', 'ph');
      });
      expect(result.current.isContinueEnabled).toBe(true);
    });

    it('is false when depth conflicts with a range depth field (even if geometry is satisfied)', () => {
      setupWithColumns(['d', 'min_d', 'geom'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('geom', 'geometry');
        result.current.handleConceptChange('d', 'depth');
        result.current.handleConceptChange('min_d', 'min_depth');
      });
      expect(result.current.isContinueEnabled).toBe(false);
    });
  });

  describe('depthConflictMessage', () => {
    it('is null when only depth is mapped', () => {
      setupWithColumns(['d', 'other'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('d', 'depth');
      });
      expect(result.current.depthConflictMessage).toBeNull();
    });

    it('is null when only min_depth and max_depth are mapped', () => {
      setupWithColumns(['min_d', 'max_d'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('min_d', 'min_depth');
        result.current.handleConceptChange('max_d', 'max_depth');
      });
      expect(result.current.depthConflictMessage).toBeNull();
    });

    it('is type warning when depth and min_depth are both mapped', () => {
      setupWithColumns(['d', 'min_d'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('d', 'depth');
        result.current.handleConceptChange('min_d', 'min_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
    });

    it('is type warning when depth and max_depth are both mapped', () => {
      setupWithColumns(['d', 'max_d'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('d', 'depth');
        result.current.handleConceptChange('max_d', 'max_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
    });

    it('is type warning when depth, min_depth, and max_depth are all mapped', () => {
      setupWithColumns(['d', 'min_d', 'max_d'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('d', 'depth');
        result.current.handleConceptChange('min_d', 'min_depth');
        result.current.handleConceptChange('max_d', 'max_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
    });

    it('transitions from depth_conflict to range_depth_missing when only depth is removed, then clears when min_depth is also removed', () => {
      setupWithColumns(['d', 'min_d'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('d', 'depth');
        result.current.handleConceptChange('min_d', 'min_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
      act(() => {
        result.current.handleConceptChange('d', '');
      });
      // min_depth alone is an incomplete pair — still a warning, but range_depth_missing
      expect(result.current.depthConflictMessage?.type).toBe('warning');
      act(() => {
        result.current.handleConceptChange('min_d', '');
      });
      expect(result.current.depthConflictMessage).toBeNull();
    });

    it('is type warning when only min_depth is mapped without max_depth', () => {
      setupWithColumns(['min_d'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('min_d', 'min_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
    });

    it('clears range_depth_missing when the missing pair partner is added', () => {
      setupWithColumns(['min_d', 'max_d'], undefined, true);
      const { result } = renderHook(() => useMappingsStep('1'));
      act(() => {
        result.current.handleConceptChange('min_d', 'min_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
      act(() => {
        result.current.handleConceptChange('max_d', 'max_depth');
      });
      expect(result.current.depthConflictMessage).toBeNull();
    });
  });

  describe('save', () => {
    let mockCreateProcedure: jest.Mock;
    let mockCreateMapping: jest.Mock;

    beforeEach(() => {
      mockCreateProcedure = jest.fn().mockResolvedValue({ id: 'proc-1' });
      mockCreateMapping = jest.fn().mockResolvedValue({ id: 'mapping-1', data_mapping: {} });
      (useCreateProcedureMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateProcedure });
      (useCreateMappingsMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateMapping });
      setupWithColumns(['col1', 'col2']);
    });

    it('saves a metadata field as a plain string', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'geometry');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: 'geometry' }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('saves a soil property without unit as { property_id }', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: { property_id: 'soil-ph' } }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('saves a soil property with unit as { property_id, conversion_id }', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleUnitChange('col1', 'mg/kg');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: { property_id: 'soil-ph', conversion_id: 'mg/kg' } }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('creates a procedure and links its id when detail fields are filled', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleDetailChange('col1', 'technique', 'acid_digestion');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateProcedure).toHaveBeenCalledWith(expect.objectContaining({ technique: 'acid_digestion' }));
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: { property_id: 'soil-ph', procedure_id: 'proc-1' } }));
    });

    it('excludes unmapped columns from the mapping request', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'geometry');
        // col2 intentionally left unmapped
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      const payload = mockCreateMapping.mock.calls[0][0];
      expect(payload).not.toHaveProperty('col2');
    });
  });

  describe('leave Ingestion flow', () => {
    it('calls markAsChanged on mount', () => {
      renderHook(() => useMappingsStep('42'));
      expect(mockMarkAsChanged).toHaveBeenCalled();
    });

    it('handleSaveAndContinueLater calls resetChanges', async () => {
      const { result } = renderHook(() => useMappingsStep('42'));
      await act(async () => {
        await result.current.handleSaveAndContinueLater();
      });
      expect(mockResetChanges).toHaveBeenCalled();
    });
  });
});
