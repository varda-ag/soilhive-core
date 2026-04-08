import { act, renderHook, waitFor } from '@testing-library/react';
import { useFileUpload } from 'hooks/useFileUpload';

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
    responseText: JSON.stringify({ id: 'file-123' }),
  };
}

describe('useFileUpload', () => {
  let xhrMock: XhrMock;
  const originalXhr = global.XMLHttpRequest;

  beforeEach(() => {
    xhrMock = buildXhrMock();
    xhrMock.send.mockImplementation(() => {
      // `useFileUpload` sets `onreadystatechange` before calling `send`.
      xhrMock.onreadystatechange?.();
    });
    const XhrCtor = jest.fn(() => xhrMock) as any;
    // `useFileUpload` checks static property `XMLHttpRequest.DONE` to resolve the promise.
    XhrCtor.DONE = originalXhr.DONE;
    global.XMLHttpRequest = XhrCtor;
  });

  afterEach(() => {
    global.XMLHttpRequest = originalXhr;
    jest.clearAllMocks();
  });

  describe('handleFiles - extension validation', () => {
    it('calls onFileUploaded for valid files and sets an error for invalid ones', async () => {
      const onFileUploaded = jest.fn();
      const { result } = renderHook(() => useFileUpload(onFileUploaded));

      const validFile = new File(['data'], 'layer.csv', { type: 'text/csv' });
      const invalidFile = new File(['data'], 'report.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.handleFiles([validFile, invalidFile]);
      });

      // The valid file was uploaded and the callback was invoked.
      expect(onFileUploaded).toHaveBeenCalledTimes(1);
      expect(onFileUploaded).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-123', name: 'layer.csv' }));

      // An error entry was recorded for the rejected extension.
      await waitFor(() => {
        expect(result.current.uploadErrors).toHaveLength(1);
        expect(result.current.uploadErrors[0]).toContain('report.pdf');
      });
    });
  });

  describe('handleFiles — network / server errors', () => {
    it('adds an upload error when the server returns a non-2xx status', async () => {
      xhrMock.status = 500;
      xhrMock.responseText = JSON.stringify({ message: 'Internal server error' });

      const onFileUploaded = jest.fn();
      const { result } = renderHook(() => useFileUpload(onFileUploaded));

      const file = new File(['data'], 'layer.csv', { type: 'text/csv' });

      await act(async () => {
        await result.current.handleFiles([file]);
      });

      await waitFor(() => {
        expect(result.current.uploadErrors).toHaveLength(1);
        expect(result.current.uploadErrors[0]).toContain('layer.csv');
      });
    });
  });
});
