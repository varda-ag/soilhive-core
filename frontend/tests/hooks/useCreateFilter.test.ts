import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useCreateFilter, FILTER_ALLOWED_EXTENSIONS } from 'hooks/useCreateFilter';
import { useApiQuery } from 'hooks/useApiQuery';
import { useCreateRasterFilterMutation } from 'hooks/useRasterFilterMutation';
import { useUpdateFileCrsMutation } from 'hooks/useFileMutation';
import { useFileUpload } from 'hooks/useFileUpload';
import { useFileManagement } from 'hooks/useFileManagement';
import { ADMIN_PATHS } from 'configuration/admin';
import { BACKEND_BASE_URL } from 'configuration/api';
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
jest.mock('../../src/auth/tokenStore', () => ({ getToken: () => 'token' }));

const navigate = jest.fn();
const createFilter = jest.fn();
const saveFileCrs = jest.fn();
const deleteFile = jest.fn();
const handleFilesUpload = jest.fn();
const fetchMock = jest.fn();

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
    fetchMock.mockResolvedValue({ ok: true });
    global.fetch = fetchMock as unknown as typeof fetch;
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

  describe('band', () => {
    const multibandFile = () =>
      makeFile({
        rasterBands: [
          { band_number: 1, data_type: 'Byte' },
          { band_number: 2, data_type: 'Byte' },
          { band_number: 3, data_type: 'Byte' },
        ],
      });

    it('is not required for a single-band raster', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile({ rasterBands: [{ band_number: 1, data_type: 'Byte' }] }));
      fillForm(result);

      expect(result.current.isBandRequired).toBe(false);
      expect(result.current.isInstallEnabled).toBe(true);
    });

    it('is required for a multiband raster, and blocks the install until picked', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(multibandFile());
      fillForm(result);

      expect(result.current.isBandRequired).toBe(true);
      expect(result.current.band).toBeNull();
      expect(result.current.isInstallEnabled).toBe(false);

      act(() => result.current.handleBandChange(2));

      expect(result.current.band).toBe(2);
      expect(result.current.isInstallEnabled).toBe(true);
    });

    it('is reset when the file is replaced', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(multibandFile());
      act(() => result.current.handleBandChange(2));

      await uploaded({ ...multibandFile(), id: 'file-2' });

      expect(result.current.band).toBeNull();
    });

    it('is reset when the file is removed', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(multibandFile());
      act(() => result.current.handleBandChange(2));

      await act(() => result.current.removeFile('file-1'));

      expect(result.current.band).toBeNull();
    });

    it('sends the picked band when creating the filter', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(multibandFile());
      fillForm(result);
      act(() => result.current.handleBandChange(3));

      await act(() => result.current.handleInstall());

      expect(createFilter).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'file-1', band: 3 }));
    });

    it('sends no band for a single-band raster', async () => {
      const { result } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);

      await act(() => result.current.handleInstall());

      expect(createFilter.mock.calls[0][0]).not.toHaveProperty('band');
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

  describe('leaving the page', () => {
    const discardedFile = (id: string) =>
      expect(fetchMock).toHaveBeenCalledWith(`${BACKEND_BASE_URL}/files/${id}`, {
        method: 'DELETE',
        keepalive: true,
        headers: { Authorization: 'Bearer token' },
      });

    it('deletes a file that was not installed when the page unmounts', async () => {
      const { unmount } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());

      unmount();

      discardedFile('file-1');
    });

    it('deletes a file that was not installed when the tab is closed', async () => {
      renderHook(() => useCreateFilter());
      await uploaded(makeFile());

      window.dispatchEvent(new Event('pagehide'));

      discardedFile('file-1');
    });

    it('deletes nothing without a file', () => {
      const { unmount } = renderHook(() => useCreateFilter());

      unmount();
      window.dispatchEvent(new Event('pagehide'));

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('deletes nothing once the file is removed', async () => {
      const { result, unmount } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      await act(() => result.current.removeFile('file-1'));

      unmount();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps the file of an installed filter', async () => {
      const { result, unmount } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);
      await act(() => result.current.handleInstall());

      unmount();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps the file while the filter is being created', async () => {
      createFilter.mockReturnValue(new Promise(() => undefined));
      const { result, unmount } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);
      act(() => {
        result.current.handleInstall();
      });

      unmount();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('deletes the file again after creating the filter failed', async () => {
      createFilter.mockRejectedValue(new Error('409'));
      const { result, unmount } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      fillForm(result);
      await act(() => result.current.handleInstall());

      unmount();

      discardedFile('file-1');
    });

    it('deletes an upload that finishes after the page unmounted', async () => {
      const { unmount } = renderHook(() => useCreateFilter());

      unmount();
      await uploaded(makeFile({ id: 'file-late' }));

      discardedFile('file-late');
    });

    it('stops listening for the tab closing after unmount', async () => {
      const { unmount } = renderHook(() => useCreateFilter());
      await uploaded(makeFile());
      unmount();
      fetchMock.mockClear();

      window.dispatchEvent(new Event('pagehide'));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
