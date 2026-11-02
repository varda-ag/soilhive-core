import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useCreateFilter, FILTER_ALLOWED_EXTENSIONS } from 'hooks/useCreateFilter';
import { useApiQuery } from 'hooks/useApiQuery';
import { useCreateRasterFilterMutation } from 'hooks/useRasterFilterMutation';
import { useUpdateFileCrsMutation } from 'hooks/useFileMutation';
import { useFileUpload } from 'hooks/useFileUpload';
import { useFileManagement } from 'hooks/useFileManagement';
import { ADMIN_PATHS } from 'configuration/admin';
import type { SoilDataFile } from 'types/soilDataFile';

const mockInvalidateQueries = jest.fn();

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

jest.mock('hooks/useApiQuery', () => ({ useApiQuery: jest.fn() }));
jest.mock('hooks/useRasterFilterMutation', () => ({ useCreateRasterFilterMutation: jest.fn() }));
jest.mock('hooks/useFileMutation', () => ({ useUpdateFileCrsMutation: jest.fn() }));
jest.mock('hooks/useFileUpload', () => ({ useFileUpload: jest.fn() }));
jest.mock('hooks/useFileManagement', () => ({ useFileManagement: jest.fn() }));

const navigate = jest.fn();
const createFilter = jest.fn();
const saveFileCrs = jest.fn();
const deleteFile = jest.fn();
const handleFilesUpload = jest.fn();

const makeFile = (overrides?: Partial<SoilDataFile>): SoilDataFile => ({
  id: 'file-1',
  file: null,
  name: 'land_cover.tif',
  progress: 100,
  crs: null,
  inferredCrs: 'EPSG:4326',
  isRaster: true,
  ...overrides,
});

const mockUploading = (uploadingFiles: File[]) =>
  (useFileUpload as jest.Mock).mockReturnValue({
    fileInputRef: { current: null },
    uploadingFiles,
    uploadProgress: {},
    uploadErrors: [],
    handleFiles: handleFilesUpload,
  });

// The hook hands its upload callback to useFileUpload, which calls it once a file is stored
const uploaded = async (file: SoilDataFile) => {
  const { calls } = (useFileUpload as jest.Mock).mock;
  const onFileUploaded = calls[calls.length - 1][0];
  await act(() => onFileUploaded(file));
};

const fillForm = (result: { current: ReturnType<typeof useCreateFilter> }) =>
  act(() => {
    result.current.handleChange('name', ' Land Cover ');
    result.current.handleChange('description', ' Copernicus land cover ');
  });

describe('useCreateFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    (useApiQuery as jest.Mock).mockReturnValue({ data: [{ code: 4326, name: 'WGS 84' }] });
    createFilter.mockResolvedValue({ id: 'land_cover' });
    saveFileCrs.mockResolvedValue({ metadata: { georeference_wgs84: { type: 'Polygon' } } });
    deleteFile.mockResolvedValue(undefined);
    (useCreateRasterFilterMutation as jest.Mock).mockReturnValue({ mutateAsync: createFilter, isPending: false });
    (useUpdateFileCrsMutation as jest.Mock).mockReturnValue({ mutateAsync: saveFileCrs });
    (useFileManagement as jest.Mock).mockReturnValue({ deleteFile, deleteFileAndMapping: jest.fn() });
    mockUploading([]);
  });

  it('accepts only GeoTIFF files', () => {
    renderHook(() => useCreateFilter());

    expect(FILTER_ALLOWED_EXTENSIONS).toEqual(['.tif', '.tiff']);
    expect(useFileUpload).toHaveBeenCalledWith(expect.any(Function), FILTER_ALLOWED_EXTENSIONS);
  });

  it('loads the CRS options', () => {
    const { result } = renderHook(() => useCreateFilter());

    expect(useApiQuery).toHaveBeenCalledWith(expect.objectContaining({ endpoint: '/epsg', method: 'GET' }));
    expect(result.current.crsOptions).toEqual([{ code: 4326, name: 'WGS 84' }]);
  });

  describe('uploading', () => {
    it('uploads only the first of several dropped files', () => {
      const first = new File([''], 'a.tif');
      const second = new File([''], 'b.tif');
      const { result } = renderHook(() => useCreateFilter());

      act(() => result.current.handleFiles([first, second]));

      expect(handleFilesUpload).toHaveBeenCalledWith([first]);
    });

    it('passes null through when no file is picked', () => {
      const { result } = renderHook(() => useCreateFilter());

      act(() => result.current.handleFiles(null));

      expect(handleFilesUpload).toHaveBeenCalledWith(null);
    });

    it('keeps the uploaded file', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await uploaded(makeFile());

      expect(result.current.filterFile).toEqual(expect.objectContaining({ id: 'file-1', error: null }));
    });

    it('replaces the previous file and deletes it', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await uploaded(makeFile({ id: 'file-1' }));
      await uploaded(makeFile({ id: 'file-2', name: 'other.tif' }));

      expect(result.current.filterFile?.id).toBe('file-2');
      expect(deleteFile).toHaveBeenCalledWith('file-1');
    });

    it('marks a raster without georeferencing as an error', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await uploaded(makeFile({ isUngeoreferencedRaster: true }));

      expect(result.current.filterFile?.error).toBe('This raster has no georeferencing: remove it and upload a georeferenced version.');
    });

    it('removes the file and deletes it', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await uploaded(makeFile());
      await act(() => result.current.removeFile('file-1'));

      expect(result.current.filterFile).toBeNull();
      expect(deleteFile).toHaveBeenCalledWith('file-1');
    });
  });

  describe('CRS', () => {
    it('keeps a typed CRS without saving it', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await uploaded(makeFile({ inferredCrs: undefined }));
      act(() => result.current.handleCrsChange('file-1', 'EPSG:43'));

      expect(result.current.filterFile?.crs).toBe('EPSG:43');
      expect(saveFileCrs).not.toHaveBeenCalled();
    });

    it('saves a selected CRS and keeps its georeference', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await uploaded(makeFile({ inferredCrs: undefined }));
      await act(() => result.current.handleCrsSelect('file-1', 'EPSG:4326 - WGS 84'));

      expect(saveFileCrs).toHaveBeenCalledWith({ epsg: 4326 });
      expect(result.current.filterFile).toEqual(
        expect.objectContaining({ suppliedCrs: 'EPSG:4326', georeferenceWgs84: { type: 'Polygon' } }),
      );
    });

    it('ignores a selection without an EPSG code', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await uploaded(makeFile());
      await act(() => result.current.handleCrsSelect('file-1', 'not a crs'));

      expect(saveFileCrs).not.toHaveBeenCalled();
    });

    it('points the CRS mutation at the current file', async () => {
      renderHook(() => useCreateFilter());

      await uploaded(makeFile({ id: 'file-7' }));

      expect(useUpdateFileCrsMutation).toHaveBeenLastCalledWith('file-7');
    });
  });

  describe('isInstallEnabled', () => {
    it('is false without a file', () => {
      const { result } = renderHook(() => useCreateFilter());
      fillForm(result);

      expect(result.current.isInstallEnabled).toBe(false);
    });

    it('is false while the name or the description is empty', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());

      expect(result.current.isInstallEnabled).toBe(false);
    });

    it('is true for a file with a detected CRS and a filled form', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);

      expect(result.current.isInstallEnabled).toBe(true);
    });

    it('is true for a raster with a custom CRS', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile({ inferredCrs: undefined, hasCustomCrs: true }));
      fillForm(result);

      expect(result.current.isInstallEnabled).toBe(true);
    });

    it('is false when the CRS is only typed, not saved', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile({ inferredCrs: undefined }));
      act(() => result.current.handleCrsChange('file-1', 'EPSG:4326 - WGS 84'));
      fillForm(result);

      expect(result.current.isInstallEnabled).toBe(false);
    });

    it('is false for a raster without georeferencing', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile({ isUngeoreferencedRaster: true }));
      fillForm(result);

      expect(result.current.isInstallEnabled).toBe(false);
    });

    it('is false while a file is uploading', async () => {
      const { result, rerender } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);

      mockUploading([new File([''], 'next.tif')]);
      rerender();

      expect(result.current.isInstallEnabled).toBe(false);
    });

    it('is false while the filter is being created', async () => {
      (useCreateRasterFilterMutation as jest.Mock).mockReturnValue({ mutateAsync: createFilter, isPending: true });
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);

      expect(result.current.isCreating).toBe(true);
      expect(result.current.isInstallEnabled).toBe(false);
    });
  });

  describe('handleInstall', () => {
    it('does nothing without a file', async () => {
      const { result } = renderHook(() => useCreateFilter());

      await act(() => result.current.handleInstall());

      expect(createFilter).not.toHaveBeenCalled();
    });

    it('creates a categorical filter from the file with the trimmed name and description', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);

      await act(() => result.current.handleInstall());

      expect(createFilter).toHaveBeenCalledWith({
        name: 'Land Cover',
        description: 'Copernicus land cover',
        file_id: 'file-1',
        kind: 'categorical',
      });
    });

    it('refreshes the list and replaces the page with the edit page of the new filter', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);

      await act(() => result.current.handleInstall());

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['rasterFilters'] });
      expect(navigate).toHaveBeenCalledWith(`${ADMIN_PATHS.FILTERS}/edit/land_cover`, { replace: true });
    });

    it('stays on the page and keeps the file when creating fails', async () => {
      createFilter.mockRejectedValue(new Error('409'));
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);

      await act(() => result.current.handleInstall());

      expect(navigate).not.toHaveBeenCalled();
      expect(deleteFile).not.toHaveBeenCalled();
      expect(result.current.filterFile?.id).toBe('file-1');
    });
  });
});
