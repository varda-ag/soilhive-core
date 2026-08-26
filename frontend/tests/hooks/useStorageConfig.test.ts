import { renderHook } from '@testing-library/react';
import { useStorageConfig } from 'hooks/useStorageConfig';
import { useApiQuery } from 'hooks/useApiQuery';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

describe('useStorageConfig', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('queries GET /storage/config unauthenticated', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true, isError: false });

    renderHook(() => useStorageConfig());

    expect(useApiQuery).toHaveBeenCalledWith({
      endpoint: '/storage/config',
      method: 'GET',
      queryKey: ['/storage/config'],
      enabled: true,
      authenticate: false,
    });
  });

  it('returns the fetched storage config', () => {
    (useApiQuery as jest.Mock).mockReturnValue({
      data: { storageMode: 'local', maxUploadSizeMB: 500 },
      isLoading: false,
      isError: false,
    });

    const { result } = renderHook(() => useStorageConfig());

    expect(result.current.storageConfig).toEqual({ storageMode: 'local', maxUploadSizeMB: 500 });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('exposes loading state without throwing while the request is in flight', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true, isError: false });

    const { result } = renderHook(() => useStorageConfig());

    expect(result.current.storageConfig).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
  });

  it('exposes error state without throwing when the request fails', () => {
    (useApiQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });

    const { result } = renderHook(() => useStorageConfig());

    expect(result.current.storageConfig).toBeUndefined();
    expect(result.current.isError).toBe(true);
  });
});
