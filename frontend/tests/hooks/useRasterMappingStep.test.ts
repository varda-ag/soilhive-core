import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useRasterMappingStep } from 'hooks/useRasterMappingStep';
import { useApiQuery } from 'hooks/useApiQuery';
import { useSoilProperties } from 'hooks/useSoilProperties';
import { useCreateProcedureMutation } from 'hooks/useCreateProcedureMutation';
import { useCreateMappingsMutation } from 'hooks/useCreateMappingsMutation';
import { useUpdateDatasetFileMappingMutation } from 'hooks/useDatasetMutation';
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

// Maps a column name 1:1 to a single-band file named after it, with the file id derived from
// the name — so a data_mapping keyed by fileID/"1" can be built for `setupWithColumnsAndExistingMapping`.
function fileIdFor(columnName: string) {
  return `${columnName}-file`;
}

function datasetFileMappingsFor(columns: string[]) {
  return columns.map(name => ({ id: `dfm-${name}`, fileID: fileIdFor(name), mappingId: `mapping-${name}` }));
}

function setupWithColumns(columns: string[]) {
  // Stable reference — new array per call would re-trigger the columnMappings useEffect on every render.
  // Each column name becomes its own single-band raster file, so it maps 1:1 to a row.
  const filesData = columns.map(name => ({
    id: fileIdFor(name),
    name,
    metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] },
  }));
  const datasetFileMappings = datasetFileMappingsFor(columns);
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
    if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

function setupWithEmptyFiles() {
  const filesData: never[] = [];
  const datasetFileMappings: never[] = [];
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
    if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

// dataMappingByColumn maps a column name to the value that should appear under its file's
// data_mapping band-0 key (e.g. 'min_depth' or { property_id: 'ph' }).
function setupWithColumnsAndExistingMapping(columns: string[], dataMappingByColumn: Record<string, unknown>) {
  // Stable references — new arrays on every render would re-trigger the columnMappings useEffect.
  const filesData = columns.map(name => ({
    id: fileIdFor(name),
    name,
    metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] },
  }));
  const datasetFileMappings = datasetFileMappingsFor(columns);
  const mappingsData = columns
    .filter(name => name in dataMappingByColumn)
    .map(name => ({ id: `mapping-${name}`, data_mapping: { '1': dataMappingByColumn[name] } }));
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
    if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
    if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
    return { data: undefined, isLoading: false };
  });
}

function setupWithFileStatuses(statuses: string[], dataUpdatedAt = 0) {
  const filesData = statuses.map((status, i) => ({
    id: `file-${i}`,
    status,
    name: 'col1',
    metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] },
  }));
  const datasetFileMappings = filesData.map(f => ({ id: `dfm-${f.id}`, fileID: f.id, mappingId: `mapping-${f.id}` }));
  mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
    if (endpoint.includes('/files')) return { data: filesData, isLoading: false, dataUpdatedAt };
    if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
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
      // Stable references — a fresh array/object on every render would re-trigger effects forever.
      const filesData = [
        { id: fileIdFor('col1'), name: 'col1', metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] }, status: 'STAGED' },
      ];
      const datasetFileMappings = [{ id: 'dfm-col1', fileID: fileIdFor('col1'), mappingId: 'mapping-col1' }];
      const mappingsData = [{ id: 'mapping-col1', data_mapping: {} }];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
        if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
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

    it('handleContinue creates a single raster-load job for the dataset when mapping has changed', async () => {
      // No existing mapping → isMappingChanged returns true → normal path (save + fire job).
      setupWithColumns(['col1']);
      const mockCreateJob = jest.fn().mockResolvedValue({ id: 'job-1' });
      (useCreateJobMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateJob });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateJob).toHaveBeenCalledWith({ dataset_id: '42', type: 'raster-load' });
      expect(mockCreateJob).toHaveBeenCalledTimes(1);
    });

    it('handleContinue creates a raster-load job when files are not yet STAGED even if mapping is unchanged', async () => {
      // Files still PENDING → allFilesUploaded=false → fast-path blocked → jobs must fire.
      const filesData = [
        { id: fileIdFor('col1'), status: 'PENDING', name: 'col1', metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] } },
      ];
      const datasetFileMappings = [{ id: 'dfm-1', fileID: fileIdFor('col1'), mappingId: 'mapping-1' }];
      const mappingsData = [{ id: 'mapping-1', data_mapping: {} }];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
        if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const mockCreateJob = jest.fn().mockResolvedValue({ id: 'job-1' });
      (useCreateJobMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateJob });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateJob).toHaveBeenCalledWith({ dataset_id: '42', type: 'raster-load' });
      expect(mockCreateJob).toHaveBeenCalledTimes(1);
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
    it('only offers soil property options, never metadata fields', () => {
      mockUseSoilProperties.mockReturnValue({
        data: [{ id: 'p1', property_name: 'Zinc', property_acronym: 'Zn', category_id: 'c1', original_units_of_measurement: {} }],
        isLoading: false,
      });
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      const codes = result.current.conceptOptionsByColumn['col1'].map(o => o.code);
      expect(codes).not.toContain('min_depth');
      expect(codes).not.toContain('max_depth');
      expect(codes).toEqual(['p1']);
    });

    it('lists soil properties sorted alphabetically', () => {
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
      expect(options[0]).toEqual({ code: 'p2', name: 'Aluminium' });
      expect(options[1]).toEqual({ code: 'p1', name: 'Zinc' });
    });

    it('offers the same soil property options to every row regardless of other rows selections', () => {
      mockUseSoilProperties.mockReturnValue({
        data: [{ id: 'p1', property_name: 'Zinc', property_acronym: 'Zn', category_id: 'c1', original_units_of_measurement: {} }],
        isLoading: false,
      });
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'p1');
      });
      expect(result.current.conceptOptionsByColumn['col2'].map(o => o.code)).toContain('p1');
    });
  });

  describe('dataMappingByFileId hydration', () => {
    it('hydrates columnMappings conceptId from the existing server mapping, keyed per file/band', () => {
      setupWithColumnsAndExistingMapping(['col1', 'col2'], { col1: 'min_depth' });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['col1'].conceptId).toBe('min_depth');
      expect(byName['col2'].conceptId).toBeNull();
    });

    it('hydrates soil-property mapping fields (unit, depth, reference period, description)', () => {
      setupWithColumnsAndExistingMapping(['col1'], {
        col1: {
          property_id: 'ph',
          conversion_id: 'mg/kg',
          min_depth: 10,
          max_depth: 20,
          reference_period_start: '2020',
          reference_period_stop: '2021',
          layer_description: 'A description',
        },
      });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      const mapping = result.current.columnMappings[0];
      expect(mapping.conceptId).toBe('ph');
      expect(mapping.unitId).toBe('mg/kg');
      expect(mapping.minDepth).toBe('10');
      expect(mapping.maxDepth).toBe('20');
      expect(mapping.referencePeriodStart).toBe('2020');
      expect(mapping.referencePeriodStop).toBe('2021');
      expect(mapping.layerDescription).toBe('A description');
    });

    it('does not mix up mappings between two different files', () => {
      setupWithColumnsAndExistingMapping(['col1', 'col2'], { col1: 'min_depth', col2: 'max_depth' });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      const byName = Object.fromEntries(result.current.columnMappings.map(m => [m.columnName, m]));
      expect(byName['col1'].conceptId).toBe('min_depth');
      expect(byName['col2'].conceptId).toBe('max_depth');
    });
  });

  describe('row naming from raster bands', () => {
    // bandCount undefined models a file with no raster metadata, e.g. a non-spatial additional
    // resource (a document) attached to the dataset.
    function setupWithFiles(files: { name: string; bandCount?: number }[]) {
      const filesData = files.map((f, i) => ({
        id: `file-${i}`,
        name: f.name,
        metadata:
          f.bandCount === undefined
            ? undefined
            : {
                is_raster: true,
                raster_bands: Array.from({ length: f.bandCount }, (_, i) => ({ band_number: i + 1 })),
              },
      }));
      const datasetFileMappings: never[] = [];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
        return { data: undefined, isLoading: false };
      });
    }

    it('names a single-band file row after the file name', () => {
      setupWithFiles([{ name: 'file_a.tif', bandCount: 1 }]);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.columnMappings.map(m => m.columnName)).toEqual(['file_a.tif']);
      expect(result.current.columnMappings[0].bandKey).toBe(1);
    });

    it('names each row after its band number for a multi-band file, with a 1-based bandKey', () => {
      setupWithFiles([{ name: 'file_bulk_raster.tif', bandCount: 2 }]);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.columnMappings.map(m => m.columnName)).toEqual([
        'file_bulk_raster.tif (band 1)',
        'file_bulk_raster.tif (band 2)',
      ]);
      expect(result.current.columnMappings.map(m => m.bandKey)).toEqual([1, 2]);
    });

    it('produces one row set per file when multiple files are uploaded, each with its own fileId', () => {
      setupWithFiles([
        { name: 'single.tif', bandCount: 1 },
        { name: 'multi.tif', bandCount: 2 },
      ]);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.columnMappings.map(m => m.columnName)).toEqual(['single.tif', 'multi.tif (band 1)', 'multi.tif (band 2)']);
      expect(result.current.columnMappings.map(m => m.fileId)).toEqual(['file-0', 'file-1', 'file-1']);
    });

    it('excludes files with no raster metadata, e.g. non-spatial additional resources', () => {
      setupWithFiles([{ name: 'raster.tif', bandCount: 1 }, { name: 'notes.pdf' }]);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.columnMappings.map(m => m.columnName)).toEqual(['raster.tif']);
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

    it('is true when at least one soil property is mapped with valid depth', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '10');
        result.current.handleMaxDepthChange('col1', '20');
      });
      expect(result.current.isContinueEnabled).toBe(true);
    });

    it('is false when a mapped row is missing depth', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
      });
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when a mapped row has non-numeric depth', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', 'abc');
        result.current.handleMaxDepthChange('col1', '20');
      });
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('is false when min depth is not less than max depth', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '20');
        result.current.handleMaxDepthChange('col1', '10');
      });
      expect(result.current.isContinueEnabled).toBe(false);
    });

    it('ignores depth on unmapped rows', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '10');
        result.current.handleMaxDepthChange('col1', '20');
        // col2 is left unmapped, with no depth set
      });
      expect(result.current.isContinueEnabled).toBe(true);
    });
  });

  describe('isSaveEnabled', () => {
    it('is false while files are still loading', () => {
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: undefined, isLoading: true };
        if (endpoint.includes('dataset-file-mapping')) return { data: [], isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.isSaveEnabled).toBe(false);
    });

    it('is true once loading finishes, regardless of mapping/depth state', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.isSaveEnabled).toBe(true);
    });
  });

  describe('depthErrors and depthValidationMessage', () => {
    it('are empty/null when no rows are mapped', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.depthErrors.col1).toEqual({ min: false, max: false });
      expect(result.current.depthValidationMessage).toBeNull();
    });

    it('flags a mapped column missing depth with a "required" message', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
      });
      expect(result.current.depthErrors.col1).toEqual({ min: true, max: true });
      expect(result.current.depthValidationMessage).toEqual({
        message: 'Min and max depth are required for every mapped layer.',
        type: 'error',
      });
    });

    it('flags a mapped column with non-numeric depth with a "numeric" message', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', 'abc');
        result.current.handleMaxDepthChange('col1', '20');
      });
      expect(result.current.depthErrors.col1).toEqual({ min: true, max: false });
      expect(result.current.depthValidationMessage).toEqual({
        message: 'Min and max depth must be numbers.',
        type: 'error',
      });
    });

    it('flags a mapped column where min depth is not less than max depth with a "range" message', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '20');
        result.current.handleMaxDepthChange('col1', '10');
      });
      expect(result.current.depthErrors.col1).toEqual({ min: true, max: true });
      expect(result.current.depthValidationMessage).toEqual({
        message: 'Min depth must be less than max depth.',
        type: 'error',
      });
    });

    /** The message the hook reports for a mapped column carrying this min/max depth pair. */
    const depthMessageFor = (minDepth: string, maxDepth: string) => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', minDepth);
        result.current.handleMaxDepthChange('col1', maxDepth);
      });
      const errors = result.current.depthErrors.col1;
      return { message: result.current.depthValidationMessage, errors, isFlagged: errors.min || errors.max };
    };

    // Both depths land in an `int` column, so Postgres rounds a fraction on the way in and the
    // layer ends up describing an interval nobody chose.
    it.each([
      ['10.5', '20'],
      ['10', '20.5'],
      ['0.1', '0.9'],
    ])('flags a fractional depth pair %s / %s with a "whole numbers" message', (minDepth, maxDepth) => {
      const { message, isFlagged } = depthMessageFor(minDepth, maxDepth);
      expect(isFlagged).toBe(true);
      expect(message).toEqual({ message: 'Min and max depth must be whole numbers of centimetres.', type: 'error' });
    });

    it.each([
      ['-10', '20'],
      ['-20', '-10'],
    ])('flags a negative depth pair %s / %s with a "cannot be negative" message', (minDepth, maxDepth) => {
      const { message, isFlagged } = depthMessageFor(minDepth, maxDepth);
      expect(isFlagged).toBe(true);
      expect(message).toEqual({ message: 'Min and max depth cannot be negative.', type: 'error' });
    });

    // 5000cm is 50m down — an order of magnitude past routine sampling, so anything beyond it is
    // a units slip or a stray digit.
    it.each([
      ['0', '5001', 'a max just past the ceiling'],
      ['10', '50000', 'millimetres entered as centimetres'],
      ['6000', '7000', 'both depths past the ceiling'],
      // Inverted as well as out of range: naming the ceiling is more use than naming the inversion.
      ['6000', '100', 'an inverted pair whose min is past the ceiling'],
    ])('flags %s / %s (%s) with a "cannot be greater" message', (minDepth, maxDepth) => {
      const { message, isFlagged } = depthMessageFor(minDepth, maxDepth);
      expect(isFlagged).toBe(true);
      expect(message).toEqual({ message: 'Min and max depth cannot be greater than 5000 cm.', type: 'error' });
    });

    it('accepts a max depth of exactly 5000', () => {
      const { message, isFlagged } = depthMessageFor('0', '5000');
      expect(isFlagged).toBe(false);
      expect(message).toBeNull();
    });

    it('blocks continue while a depth is past the ceiling, and allows it once corrected', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '0');
        result.current.handleMaxDepthChange('col1', '50000');
      });
      expect(result.current.isContinueEnabled).toBe(false);

      act(() => {
        result.current.handleMaxDepthChange('col1', '5000');
      });
      expect(result.current.isContinueEnabled).toBe(true);
      expect(result.current.depthValidationMessage).toBeNull();
    });

    // 0–30cm is the commonest topsoil interval there is, so the surface must stay expressible.
    it('accepts a min depth of zero', () => {
      const { message, isFlagged } = depthMessageFor('0', '30');
      expect(isFlagged).toBe(false);
      expect(message).toBeNull();
    });

    // A trailing zero is still a whole number of centimetres, whatever the string looks like.
    it('accepts a depth written as 10.0', () => {
      const { message, isFlagged } = depthMessageFor('10.0', '20');
      expect(isFlagged).toBe(false);
      expect(message).toBeNull();
    });

    // Whichever row comes first, the reported message is the most fundamental problem present —
    // fixing the fraction is pointless while another row has no depth at all.
    it('reports the most fundamental problem across rows, not the first one found', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleConceptChange('col2', 'ph');
        // col1 is fractional; col2 has no depth at all.
        result.current.handleMinDepthChange('col1', '10.5');
        result.current.handleMaxDepthChange('col1', '20');
      });
      expect(result.current.depthValidationMessage).toEqual({
        message: 'Min and max depth are required for every mapped layer.',
        type: 'error',
      });
      expect(result.current.depthErrors.col1).toEqual({ min: true, max: false });
      expect(result.current.depthErrors.col2).toEqual({ min: true, max: true });
    });

    it('blocks continue while a depth is fractional or negative, and allows it once corrected', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '-10.5');
        result.current.handleMaxDepthChange('col1', '20');
      });
      expect(result.current.isContinueEnabled).toBe(false);

      act(() => {
        result.current.handleMinDepthChange('col1', '0');
      });
      expect(result.current.isContinueEnabled).toBe(true);
      expect(result.current.depthValidationMessage).toBeNull();
    });

    it('clears once a valid min/max depth is provided', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '10');
        result.current.handleMaxDepthChange('col1', '20');
      });
      expect(result.current.depthErrors.col1).toEqual({ min: false, max: false });
      expect(result.current.depthValidationMessage).toBeNull();
    });

    // Only the offending input should turn red: with one depth wrong, flagging both leaves the
    // user hunting for which of the two the message is about.
    it.each([
      ['a fractional min', '10.5', '20', { min: true, max: false }],
      ['a fractional max', '10', '20.5', { min: false, max: true }],
      ['both depths fractional', '0.1', '0.9', { min: true, max: true }],
      ['a non-numeric max', '10', 'abc', { min: false, max: true }],
      ['a negative min', '-10', '20', { min: true, max: false }],
      ['both depths negative', '-20', '-10', { min: true, max: true }],
      ['a max past the ceiling', '0', '5001', { min: false, max: true }],
      ['both depths past the ceiling', '6000', '7000', { min: true, max: true }],
      ['an inverted pair whose min is past the ceiling', '6000', '100', { min: true, max: false }],
      ['a missing max', '10', '', { min: false, max: true }],
      ['a missing min', '', '20', { min: true, max: false }],
      // The one error that belongs to the pair rather than to either value.
      ['an inverted pair both depths valid on their own', '20', '10', { min: true, max: true }],
    ])('flags only the failing field for %s', (_case, minDepth, maxDepth, expected) => {
      const { errors } = depthMessageFor(minDepth, maxDepth);
      expect(errors).toEqual(expected);
    });
  });

  describe('referencePeriodErrors and referencePeriodValidationMessage', () => {
    const INVALID_MESSAGE = {
      message:
        'Reference period start and stop must be a valid year, year and month, or full date — for example 2025, 2025-06 or 2025-06-15.',
      type: 'error',
    };

    it('reports no error for a mapped column that leaves the reference period empty', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
      });
      expect(result.current.referencePeriodErrors.col1).toEqual({ start: false, stop: false });
      expect(result.current.referencePeriodValidationMessage).toBeNull();
    });

    // All three precisions the catalogue stores, so a mapping written with month or day precision
    // is not flagged for being more specific than a bare year.
    it.each(['1977', '1977-06', '1977-06-15'])('accepts %s, which the catalogue can store', value => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleReferencePeriodStartChange('col1', value);
        result.current.handleReferencePeriodStopChange('col1', value);
      });
      expect(result.current.referencePeriodErrors.col1).toEqual({ start: false, stop: false });
      expect(result.current.referencePeriodValidationMessage).toBeNull();
    });

    /** Whether the hook flags `value` as the reference period start of a mapped column. */
    const startErrorFor = (value: string): boolean => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleReferencePeriodStartChange('col1', value);
      });
      return result.current.referencePeriodErrors.col1.start;
    };

    // The digit pattern alone let these through, and it is all the check constraint on either
    // table tests — so a month of 13 or a 31st of February would have been stored and rolled up
    // into the Dataset, to be read back as a date by anything that parses it.
    it.each([
      ['2025-00', 'month zero'],
      ['2025-13', 'a month past December'],
      ['2025-06-00', 'day zero'],
      ['2025-06-31', 'a 31st of a 30-day month'],
      ['2025-02-30', 'a 30th of February'],
      ['2023-02-29', 'a leap day in a common year'],
      ['1900-02-29', 'a leap day in a century that is not a leap year'],
      ['0000', 'a year that does not exist'],
    ])('flags %s (%s)', value => {
      expect(startErrorFor(value)).toBe(true);
    });

    it.each([
      ['2024-02-29', 'a leap day in a leap year'],
      ['2000-02-29', 'a leap day in a 400-year leap century'],
      ['2025-01-01', 'the first day of a year'],
      ['2025-12-31', 'the last day of a year'],
      ['0001-01-01', 'the earliest real year'],
    ])('accepts %s (%s)', value => {
      expect(startErrorFor(value)).toBe(false);
    });

    // The regression this guards: unvalidated, an extra digit ingested every band cleanly and
    // then failed a check constraint as the load rolled the value up to the Dataset, where the
    // error could name neither the band nor the field that supplied it.
    it('flags a five-digit year on start, leaving stop clean', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleReferencePeriodStartChange('col1', '20255');
        result.current.handleReferencePeriodStopChange('col1', '2015');
      });
      expect(result.current.referencePeriodErrors.col1).toEqual({ start: true, stop: false });
      expect(result.current.referencePeriodValidationMessage).toEqual(INVALID_MESSAGE);
    });

    it('flags stop independently of start', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleReferencePeriodStartChange('col1', '1977');
        result.current.handleReferencePeriodStopChange('col1', '15/06/2015');
      });
      expect(result.current.referencePeriodErrors.col1).toEqual({ start: false, stop: true });
      expect(result.current.referencePeriodValidationMessage).toEqual(INVALID_MESSAGE);
    });

    // Same reason the depth check skips unmapped rows: their details are never written to the
    // Band Mapping, so nothing malformed can reach the catalogue from them.
    it('leaves an unmapped row unflagged however malformed its reference period', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleReferencePeriodStartChange('col1', '20255');
      });
      expect(result.current.referencePeriodErrors.col1).toEqual({ start: false, stop: false });
      expect(result.current.referencePeriodValidationMessage).toBeNull();
    });

    it('flags only the offending row when another mapped row is valid', () => {
      setupWithColumns(['col1', 'col2']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleConceptChange('col2', 'ph');
        result.current.handleReferencePeriodStartChange('col1', '20255');
        result.current.handleReferencePeriodStartChange('col2', '1977');
      });
      expect(result.current.referencePeriodErrors.col1.start).toBe(true);
      expect(result.current.referencePeriodErrors.col2.start).toBe(false);
    });

    it('blocks continue while a reference period is invalid, and allows it once corrected', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '10');
        result.current.handleMaxDepthChange('col1', '20');
        result.current.handleReferencePeriodStartChange('col1', '20255');
      });
      expect(result.current.isContinueEnabled).toBe(false);

      act(() => {
        result.current.handleReferencePeriodStartChange('col1', '2025');
      });
      expect(result.current.isContinueEnabled).toBe(true);
      expect(result.current.referencePeriodValidationMessage).toBeNull();
    });

    // Save is deliberately not gated: a half-finished mapping must still be storable.
    it('leaves save enabled while a reference period is invalid', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleReferencePeriodStartChange('col1', '20255');
      });
      expect(result.current.isSaveEnabled).toBe(true);
    });
  });

  describe('save', () => {
    let mockCreateProcedure: jest.Mock;
    let mockCreateMapping: jest.Mock;
    let mockUpdateDatasetFileMapping: jest.Mock;

    beforeEach(() => {
      mockCreateProcedure = jest.fn().mockResolvedValue({ id: 'proc-1' });
      mockCreateMapping = jest.fn().mockResolvedValue({ id: 'new-mapping-1', data_mapping: {} });
      mockUpdateDatasetFileMapping = jest.fn().mockResolvedValue(undefined);
      (useCreateProcedureMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateProcedure });
      (useCreateMappingsMutation as jest.Mock).mockReturnValue({ mutateAsync: mockCreateMapping });
      (useUpdateDatasetFileMappingMutation as jest.Mock).mockReturnValue({ mutateAsync: mockUpdateDatasetFileMapping });
      setupWithColumns(['col1', 'col2']);
    });

    it('saves a soil property without unit as { property_id }', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ '1': { property_id: 'soil-ph' } }));
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
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ '1': { property_id: 'soil-ph', conversion_id: 'mg/kg' } }));
      expect(mockCreateProcedure).not.toHaveBeenCalled();
    });

    it('includes min/max depth, reference period, and layer description when set', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleMinDepthChange('col1', '10');
        result.current.handleMaxDepthChange('col1', '20');
        result.current.handleReferencePeriodStartChange('col1', '2020');
        result.current.handleReferencePeriodStopChange('col1', '2021');
        result.current.handleLayerDescriptionChange('col1', 'A description');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith(
        expect.objectContaining({
          '1': {
            property_id: 'soil-ph',
            min_depth: 10,
            max_depth: 20,
            reference_period_start: '2020',
            reference_period_stop: '2021',
            layer_description: 'A description',
          },
        }),
      );
    });

    it('creates a procedure and links its id when detail fields are filled', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleDetailChange('col1', 'laboratoryMethod', 'ICP-OES');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateProcedure).toHaveBeenCalledWith(expect.objectContaining({ laboratory_method: 'ICP-OES' }));
      expect(mockCreateMapping).toHaveBeenCalledWith(expect.objectContaining({ '1': { property_id: 'soil-ph', procedure_id: 'proc-1' } }));
    });

    it('excludes unmapped columns from the mapping request', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        // col2 intentionally left unmapped
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      const payload = mockCreateMapping.mock.calls[0][0];
      expect(payload).toEqual({ '1': { property_id: 'soil-ph' } });
    });

    it('still seeds an empty mapping request for a file whose bands were never mapped, so it always ends up with a mappingId', async () => {
      // col2's file has no prior saved mapping and none of its bands get mapped here — it must
      // still resolve to a mappingId pointing at an empty mapping. Otherwise the raster-load job's
      // prepareStagedBands throws RL_MAPPING_NOT_CONFIGURED for it, failing the whole job.
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        // col2 intentionally left unmapped
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledTimes(2);
      expect(mockCreateMapping).toHaveBeenCalledWith({});
      expect(mockUpdateDatasetFileMapping).toHaveBeenCalledWith({
        datasetId: '42',
        datasetFileMappingId: 'dfm-col2',
        mappingId: 'new-mapping-1',
      });
    });

    it('seeds an empty mapping request for a file mapped then unmapped in the same sitting, with no prior saved mapping', async () => {
      // Reproduces the reported bug: a file that's never been saved before gets a field mapped
      // and then unmapped before Continue/Save — it must still end up with a mappingId pointing
      // at an empty mapping, not with no mappingId at all.
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleConceptChange('col1', '');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith({});
      expect(mockUpdateDatasetFileMapping).toHaveBeenCalledWith({
        datasetId: '42',
        datasetFileMappingId: 'dfm-col1',
        mappingId: 'new-mapping-1',
      });
    });

    it('reconciles a file down to an empty mapping when all of its bands are unmapped', async () => {
      // col1 had a saved mapping; clearing its only band must still send an (empty) request for
      // that file so the stale server-side mapping gets overwritten instead of left untouched.
      setupWithColumnsAndExistingMapping(['col1'], { col1: 'min_depth' });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', '');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith({});
      expect(mockUpdateDatasetFileMapping).toHaveBeenCalledWith({
        datasetId: '42',
        datasetFileMappingId: 'dfm-col1',
        mappingId: 'new-mapping-1',
      });
    });

    it('creates one mapping request per distinct file and links each to its own dataset-file-mapping', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      act(() => {
        result.current.handleConceptChange('col1', 'soil-ph');
        result.current.handleConceptChange('col2', 'soil-om');
      });
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledTimes(2);
      expect(mockCreateMapping).toHaveBeenCalledWith({ '1': { property_id: 'soil-ph' } });
      expect(mockCreateMapping).toHaveBeenCalledWith({ '1': { property_id: 'soil-om' } });
      expect(mockUpdateDatasetFileMapping).toHaveBeenCalledWith({
        datasetId: '42',
        datasetFileMappingId: 'dfm-col1',
        mappingId: 'new-mapping-1',
      });
      expect(mockUpdateDatasetFileMapping).toHaveBeenCalledWith({
        datasetId: '42',
        datasetFileMappingId: 'dfm-col2',
        mappingId: 'new-mapping-1',
      });
    });

    it('reconciles the mapping via save() even when handleContinue takes the "nothing changed" fast path', async () => {
      // Regression test: handleContinue used to return before ever calling save() when nothing
      // had changed and all files were staged, so it could skip the mappingId/data_mapping
      // reconciliation that handleSaveAndContinueLater always performs. Continue must persist
      // identically to Save for later regardless of that fast path.
      const filesData = [
        { id: fileIdFor('col1'), name: 'col1', metadata: { is_raster: true, raster_bands: [{ band_number: 1 }] }, status: 'STAGED' },
      ];
      const datasetFileMappings = [{ id: 'dfm-col1', fileID: fileIdFor('col1'), mappingId: 'mapping-col1' }];
      const mappingsData = [{ id: 'mapping-col1', data_mapping: { '1': { property_id: 'soil-ph' } } }];
      mockUseApiQuery.mockImplementation(({ endpoint }: { endpoint: string }) => {
        if (endpoint.includes('/files')) return { data: filesData, isLoading: false };
        if (endpoint.includes('/mappings')) return { data: mappingsData, isLoading: false };
        if (endpoint.includes('dataset-file-mapping')) return { data: datasetFileMappings, isLoading: false };
        return { data: undefined, isLoading: false };
      });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(mockCreateMapping).toHaveBeenCalledWith({ '1': { property_id: 'soil-ph' } });
      expect(mockUpdateDatasetFileMapping).toHaveBeenCalledWith({
        datasetId: '42',
        datasetFileMappingId: 'dfm-col1',
        mappingId: 'new-mapping-1',
      });
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });
  });

  describe('showLoadingPanel', () => {
    beforeEach(() => {
      setupWithFileStatuses(['PENDING']);
      (useJobsQueries as jest.Mock).mockImplementation((ids: string[]) => ids.map(id => ({ data: { id, status: 'completed' } })));
    });

    it('navigates to preview and keeps showLoadingPanel false when dataset gis_datatype is not raster', async () => {
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(result.current.showLoadingPanel).toBe(false);
      expect(mockNavigate).toHaveBeenCalledWith('/admin/datasets/edit/42/preview');
    });

    it('sets showLoadingPanel to true and does not navigate when dataset gis_datatype is raster', async () => {
      (useDataset as jest.Mock).mockReturnValue({ data: { name: 'Mock-dataset', gis_datatype: 'raster' } });
      const { result } = renderHook(() => useRasterMappingStep('42'));
      await act(async () => {
        await result.current.handleContinue();
      });
      expect(result.current.showLoadingPanel).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('sets showLoadingPanel to true for raster datasets even though the raster-load job has not completed', async () => {
      // useJobsQueries returns [] here (module default), so the job-completion effect never
      // fires — showLoadingPanel can only become true if handleContinue sets it directly on click,
      // rather than waiting on job polling to flip it once the job resolves.
      (useJobsQueries as jest.Mock).mockImplementation(() => []);
      (useDataset as jest.Mock).mockReturnValue({ data: { name: 'Mock-dataset', gis_datatype: 'raster' } });
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
