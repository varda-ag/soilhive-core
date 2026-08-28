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

  describe('invalidDepthColumns and depthValidationMessage', () => {
    it('are empty/null when no rows are mapped', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      expect(result.current.invalidDepthColumns.size).toBe(0);
      expect(result.current.depthValidationMessage).toBeNull();
    });

    it('flags a mapped column missing depth with a "required" message', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
      });
      expect(result.current.invalidDepthColumns.has('col1')).toBe(true);
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
      expect(result.current.invalidDepthColumns.has('col1')).toBe(true);
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
      expect(result.current.invalidDepthColumns.has('col1')).toBe(true);
      expect(result.current.depthValidationMessage).toEqual({
        message: 'Min depth must be less than max depth.',
        type: 'error',
      });
    });

    it('clears once a valid min/max depth is provided', () => {
      setupWithColumns(['col1']);
      const { result } = renderHook(() => useRasterMappingStep('1'));
      act(() => {
        result.current.handleConceptChange('col1', 'ph');
        result.current.handleMinDepthChange('col1', '10');
        result.current.handleMaxDepthChange('col1', '20');
      });
      expect(result.current.invalidDepthColumns.size).toBe(0);
      expect(result.current.depthValidationMessage).toBeNull();
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
