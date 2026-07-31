import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useRasterMappingStep } from 'hooks/useRasterMappingStep';
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

function setupWithColumns(columns: string[]) {
  // Stable reference — new array per call would re-trigger the columnMappings useEffect on every render.
  // Each column name becomes its own single-band raster file, so it maps 1:1 to a row.
  const filesData = columns.map(name => ({
    name,
    metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] },
  }));
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

function setupWithColumnsAndExistingMapping(columns: string[], dataMapping: Record<string, unknown>) {
  // Stable references — new arrays on every render would re-trigger the columnMappings useEffect.
  const filesData = columns.map(name => ({
    name,
    metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] },
  }));
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
    name: 'col1',
    metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] },
  }));
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false, dataUpdatedAt };
    if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

describe('useRasterMappingStep', () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
    mockNavigate.mockClear();
  });

  describe('initial state', () => {
    it('has no expanded rows', () => {
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.expandedRows.size).toBe(0);
    });
  });

  describe('datasetGisDataType', () => {
    it('returns the dataset gis_datatype', () => {
      (useDataset as jest.Mock).mockReturnValue({ data: { name: 'Mock-dataset', gis_datatype: 'raster' } });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.datasetGisDataType).toBe('raster');
    });

    it('is null when the dataset has no gis_datatype', () => {
      (useDataset as jest.Mock).mockReturnValue({ data: { name: 'Mock-dataset' } });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.datasetGisDataType).toBeNull();
    });

    it('is null when the dataset has not loaded yet', () => {
      (useDataset as jest.Mock).mockReturnValue({ data: undefined });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.datasetGisDataType).toBeNull();
    });
  });

  describe('navigation', () => {
    it('handlePrevious navigates to the soil-data step', () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handlePrevious();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/soil-data');
    });

    it('handleContinue navigates to the preview step when files are already uploaded and mapping is unchanged', async () => {
      // Fast path: all files STAGED + no mapping change → navigate immediately.
      const filesData = [{ name: 'col1', metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] }, status: 'STAGED' }];
      const mappingsData = [{ data_mapping: {} }];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('handleSaveAndContinueLater navigates to the datasets list', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
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
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateJob).toHaveBeenCalledWith({ dataset_id: '42', type: 'file-to-db', file_id: 'file-1' });
    });

    it('handleContinue creates jobs when files are not yet STAGED even if mapping is unchanged', async () => {
      // Files still PENDING → allFilesUploaded=false → fast-path blocked → jobs must fire.
      const filesData = [{ status: 'PENDING', name: 'col1', metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] } }];
      const mappingsData = [{ data_mapping: {} }];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
        if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const mockCreateJob = jest.fn().mockResolvedValue({ id: 'job-1' });
      (useCreateJobMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateJob });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateJob).toHaveBeenCalledWith({ dataset_id: '42', type: 'file-to-db', file_id: 'file-1' });
    });
  });

  describe('isImporting', () => {
    it('is false when no file is ONGOING and handleContinue has not been called', () => {
      setupWithFileStatuses(['PENDING']);
      const { result } = renderHook(() => useRasterMappingStep('42'));
      expect(result.current.isImporting).toBe(false);
    });

    it('is true when at least one file has ONGOING status', () => {
      setupWithFileStatuses(['ONGOING']);
      const { result } = renderHook(() => useRasterMappingStep('42'));
      expect(result.current.isImporting).toBe(true);
    });

    it('is true immediately after handleContinue fires before server confirms', async () => {
      setupWithFileStatuses(['PENDING']);
      const { result } = renderHook(() => useRasterMappingStep('42'));
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
      const { result } = renderHook(() => useRasterMappingStep('42'));

      await act(async () => {
        await result.current.handleContinue();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('does not redirect when handleContinue was not called (no active jobs)', async () => {
      setupWithFileStatuses(['STAGED']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'completed' } })));
      renderHook(() => useRasterMappingStep('42'));
      await act(async () => {});
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not redirect while jobs are still running', async () => {
      setupWithFileStatuses(['PENDING']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'running' } })));
      const { result } = renderHook(() => useRasterMappingStep('42'));

      await act(async () => {
        await result.current.handleContinue();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not redirect when job query has not yet resolved', async () => {
      setupWithFileStatuses(['PENDING']);
      // data is undefined — filtered out of jobsData, so jobsData.length < activeJobIds.length
      (useJobsQueries as jest.Mock).mockImplementation(() => [{ data: undefined }]);
      const { result } = renderHook(() => useRasterMappingStep('42'));

      await act(async () => {
        await result.current.handleContinue();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('resets importing state when a job fails without navigating', async () => {
      setupWithFileStatuses(['PENDING']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'failed' } })));
      const { result } = renderHook(() => useRasterMappingStep('42'));

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
      const { result } = renderHook(() => useRasterMappingStep('1'));
      const codes = result.current.conceptOptionsByColumn['col1'].map(o => o.code);
      expect(codes).toContain('min_depth');
      expect(codes).toContain('max_depth');
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
      const { result } = renderHook(() => useRasterMappingStep('1'));
      const options = result.current.conceptOptionsByColumn['col1'];
      const metadataCount = 2; // METADATA_FIELD_OPTIONS length
      expect(options[metadataCount]).toEqual({ code: 'p2', name: 'Aluminium' });
      expect(options[metadataCount + 1]).toEqual({ code: 'p1', name: 'Zinc' });
    });

    it('hides a metadata option from other rows once it is selected by one row', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'min_depth');
      });
      expect(result.current.conceptOptionsByColumn['col2'].map(o => o.code)).not.toContain('min_depth');
    });

    it('keeps the metadata option visible in the row that owns it', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'min_depth');
      });
      expect(result.current.conceptOptionsByColumn['col1'].map(o => o.code)).toContain('min_depth');
    });

    it('restores a metadata option to all rows when its owning row is cleared', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'min_depth');
      });
      act(() => {
        result.current.handleConceptChange('col1', '');
      });
      expect(result.current.conceptOptionsByColumn['col2'].map(o => o.code)).toContain('min_depth');
    });
  });

  describe('mergedMappings', () => {
    it('hydrates columnMappings conceptId from the existing server mapping', () => {
      setupWithColumnsAndExistingMapping(['col1', 'col2'], { col1: 'min_depth' });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['col1'].conceptId).toBe('min_depth');
      expect(byName['col2'].conceptId).toBeNull();
    });
  });

  describe('row naming from raster bands', () => {
    function setupWithFiles(files: { name: string; bandCount: number }[]) {
      const filesData = files.map(f => ({
        name: f.name,
        metadata: {
          is_raster: true,
          raster_bands: Array.from({ length: f.bandCount }, (_, i) => ({ band_number: i + 1 })),
        },
      }));
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('dataset-file-mapping')) return { data: defaultDatasetFileMappings, isLoading: false };
        return { data: undefined, isLoading: false };
      });
    }

    it('names a single-band file row after the file name', () => {
      setupWithFiles([{ name: 'file_a.tif', bandCount: 1 }]);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.columnMappings.map(m => m.columnName)).toEqual(['file_a.tif']);
    });

    it('names each row after its band number for a multi-band file', () => {
      setupWithFiles([{ name: 'file_bulk_raster.tif', bandCount: 2 }]);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.columnMappings.map(m => m.columnName)).toEqual([
        'file_bulk_raster.tif (band 1)',
        'file_bulk_raster.tif (band 2)',
      ]);
    });

    it('produces one row set per file when multiple files are uploaded', () => {
      setupWithFiles([
        { name: 'single.tif', bandCount: 1 },
        { name: 'multi.tif', bandCount: 2 },
      ]);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.columnMappings.map(m => m.columnName)).toEqual(['single.tif', 'multi.tif (band 1)', 'multi.tif (band 2)']);
    });
  });

  describe('isContinueEnabled', () => {
    it('is false when files array is empty', () => {
      setupWithEmptyFiles();
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when no columns are mapped', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is true when at least one soil property is mapped', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
      });
      expect(result.current.isContinueEnabled).toBe(true);
    });

    it('is false when only a metadata column is mapped (no soil property)', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'min_depth');
      });
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when depth conflicts with a range depth field (even if a soil property is mapped)', () => {
      setupWithColumns(['min_d', 'ph']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('ph', 'ph');
        result.current.handleConceptChange('min_d', 'min_depth');
      });
      expect(result.current.isContinueEnabled).toBe(false);
    });
  });

  describe('depthConflictMessage', () => {
    it('is null when nothing is mapped', () => {
      setupWithColumns(['d', 'other']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.depthConflictMessage).toBeNull();
    });

    it('is null when only min_depth and max_depth are mapped', () => {
      setupWithColumns(['min_d', 'max_d']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('min_d', 'min_depth');
        result.current.handleConceptChange('max_d', 'max_depth');
      });
      expect(result.current.depthConflictMessage).toBeNull();
    });

    it('is type warning when only min_depth is mapped without max_depth', () => {
      setupWithColumns(['min_d']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('min_d', 'min_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
    });

    it('is type warning when only max_depth is mapped without min_depth', () => {
      setupWithColumns(['max_d']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('max_d', 'max_depth');
      });
      expect(result.current.depthConflictMessage?.type).toBe('warning');
    });

    it('clears range_depth_missing when the missing pair partner is added', () => {
      setupWithColumns(['min_d', 'max_d']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
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
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'min_depth');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ col1: 'min_depth' }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('saves a soil property without unit as { property_id }', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
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
      const { result } = renderHook(() => useRasterMappingStep('42'));
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
      const { result } = renderHook(() => useRasterMappingStep('42'));
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
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'min_depth');
        // col2 intentionally left unmapped
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      const payload = mockCreateMapping.mock.calls[0][0];
      expect(payload).not.toHaveProperty('col2');
    });
  });

  describe('showLoadingPanel', () => {
    beforeEach(() => {
      setupWithFileStatuses(['PENDING']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'completed' } })));
    });

    it('navigates to preview and keeps showLoadingPanel false when isRaster is false', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(result.current.showLoadingPanel).toBe(false);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('sets showLoadingPanel to true and does not navigate when isRaster is true', async () => {
      (useIngestionFlow as jest.Mock).mockReturnValue({
        markAsChanged: mockMarkAsChanged,
        resetChanges: mockResetChanges,
        isRaster: true,
      });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(result.current.showLoadingPanel).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('leave Ingestion flow', () => {
    it('calls markAsChanged on mount', () => {
      renderHook(() => useRasterMappingStep('42'));
      expect(mockMarkAsChanged).toHaveBeenCalled();
    });

    it('handleSaveAndContinueLater calls resetChanges', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleSaveAndContinueLater();
      });
      expect(mockResetChanges).toHaveBeenCalled();
    });
  });
});
