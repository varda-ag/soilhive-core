import { act, renderHook, waitFor } from '@testing-library/react';
import { useAdditionalResourceUpload } from 'hooks/useAdditionalResourceUpload';
import { useStorageConfig } from 'hooks/useStorageConfig';

jest.mock('hooks/useStorageConfig', () => ({
  useStorageConfig: jest.fn(),
}));

jest.mock('../../src/configuration/api', () => ({
  BACKEND_BASE_URL: 'http://mocked-backend',
}));

jest.mock('../../src/auth/tokenStore', () => ({
  getToken: jest.fn().mockReturnValue('mocked-token'),
}));

interface XhrMock {
  open: jest.Mock;
  setRequestHeader: jest.Mock;
  send: jest.Mock;
  upload: { addEventListener: jest.Mock };
  onreadystatechange: (() => void) | null;
  readyState: number;
  status: number;
  responseText: string;
}

function buildXhrMock(): XhrMock {
  return {
    open: jest.fn(),
    setRequestHeader: jest.fn(),
    send: jest.fn(),
    upload: { addEventListener: jest.fn() },
    onreadystatechange: null,
    readyState: XMLHttpRequest.DONE,
    status: 200,
    responseText: JSON.stringify({ id: 'file-123', name: 'manual.pdf' }),
  };
}

describe('useAdditionalResourceUpload', () => {
  let xhrMock: XhrMock;
  const originalXhr = global.XMLHttpRequest;

  beforeEach(() => {
    xhrMock = buildXhrMock();
    xhrMock.send.mockImplementation(() => {
      // `useAdditionalResourceUpload` sets `onreadystatechange` before calling `send`.
      xhrMock.onreadystatechange?.();
    });
    const XhrCtor = jest.fn(() => xhrMock) as any;
    // `useAdditionalResourceUpload` checks static property `XMLHttpRequest.DONE` to resolve the promise.
    XhrCtor.DONE = originalXhr.DONE;
    global.XMLHttpRequest = XhrCtor;

    (useStorageConfig as jest.Mock).mockReturnValue({
      storageConfig: { storageMode: 'local', maxUploadSizeMB: 500 },
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXhr;
    jest.clearAllMocks();
  });

  it('uploads to /files with spatial=false so the backend skips geospatial metadata extraction', async () => {
    const onFileUploaded = jest.fn();
    const { result } = renderHook(() => useAdditionalResourceUpload(onFileUploaded));
    const file = new File(['data'], 'manual.pdf', { type: 'application/pdf' });

    await act(async () => {
      await result.current.handleFiles([file]);
    });

    expect(xhrMock.open).toHaveBeenCalledWith('POST', 'http://mocked-backend/files?spatial=false');
    expect(onFileUploaded).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'file-123', name: 'manual.pdf' }));
  });

  describe('handleFiles - extension validation', () => {
    it('calls onFileUploaded for valid files and sets an error for invalid ones', async () => {
      const onFileUploaded = jest.fn();
      const { result } = renderHook(() => useAdditionalResourceUpload(onFileUploaded));

      const validFile = new File(['data'], 'manual.pdf', { type: 'application/pdf' });
      const invalidFile = new File(['data'], 'layer.csv', { type: 'text/csv' });

      await act(async () => {
        await result.current.handleFiles([validFile, invalidFile]);
      });

      expect(onFileUploaded).toHaveBeenCalledTimes(1);
      expect(onFileUploaded).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'file-123', name: 'manual.pdf' }));

      await waitFor(() => {
        expect(result.current.uploadErrors).toHaveLength(1);
        expect(result.current.uploadErrors[0]).toContain('layer.csv');
      });
    });

    it('accepts both .tif and .tiff', async () => {
      const onFileUploaded = jest.fn();
      const { result } = renderHook(() => useAdditionalResourceUpload(onFileUploaded));

      const tifFile = new File(['data'], 'prediction.tif', { type: 'image/tiff' });
      const tiffFile = new File(['data'], 'prediction.tiff', { type: 'image/tiff' });

      await act(async () => {
        await result.current.handleFiles([tifFile, tiffFile]);
      });

      expect(onFileUploaded).toHaveBeenCalledTimes(2);
      expect(result.current.uploadErrors).toHaveLength(0);
    });
  });

  describe('handleFiles — network / server errors', () => {
    it('adds an upload error when the server returns a non-2xx status', async () => {
      xhrMock.status = 500;
      xhrMock.responseText = JSON.stringify({ message: 'Internal server error' });

      const onFileUploaded = jest.fn();
      const { result } = renderHook(() => useAdditionalResourceUpload(onFileUploaded));

      const file = new File(['data'], 'manual.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.handleFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.uploadErrors).toHaveLength(1);
        expect(result.current.uploadErrors[0]).toContain('manual.pdf');
      });
    });
  });

  describe('handleFiles — size validation', () => {
    function createFileWithSize(name: string, sizeInBytes: number): File {
      const file = new File(['data'], name, { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: sizeInBytes, configurable: true });
      return file;
    }

    it('uploads a file under the size limit unchanged', async () => {
      const onFileUploaded = jest.fn();
      const { result } = renderHook(() => useAdditionalResourceUpload(onFileUploaded));
      const file = createFileWithSize('manual.pdf', 1024);

      await act(async () => {
        await result.current.handleFiles([file]);
      });

      expect(xhrMock.send).toHaveBeenCalledTimes(1);
      expect(onFileUploaded).toHaveBeenCalledWith(expect.objectContaining({ file_id: 'file-123', name: 'manual.pdf' }));
      expect(result.current.uploadErrors).toHaveLength(0);
    });

    it('rejects a file over the size limit without sending a request', async () => {
      (useStorageConfig as jest.Mock).mockReturnValue({
        storageConfig: { storageMode: 'local', maxUploadSizeMB: 1 },
        isLoading: false,
        isError: false,
      });
      const onFileUploaded = jest.fn();
      const { result } = renderHook(() => useAdditionalResourceUpload(onFileUploaded));
      const file = createFileWithSize('manual.pdf', 2 * 1024 * 1024);

      await act(async () => {
        await result.current.handleFiles([file]);
      });

      expect(xhrMock.send).not.toHaveBeenCalled();
      expect(onFileUploaded).not.toHaveBeenCalled();
      await waitFor(() => {
        expect(result.current.uploadErrors).toHaveLength(1);
        expect(result.current.uploadErrors[0]).toContain('manual.pdf');
      });
    });
  });
});
