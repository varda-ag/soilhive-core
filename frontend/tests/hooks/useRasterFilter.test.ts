import { renderHook } from '@testing-library/react';
import { useApiQuery } from 'hooks/useApiQuery';
import { useRasterFilter } from 'hooks/useRasterFilter';
import { RasterFilterInstallStatus } from 'types/backend';

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(() => ({ data: undefined })),
}));

const useApiQueryMock = useApiQuery as jest.Mock;

// The refetchInterval callback only reads query.state.data
const queryWithStatus = (status?: RasterFilterInstallStatus) => ({ state: { data: status ? { install: { status } } : undefined } });
const failedQuery = { state: { status: 'error', data: undefined } };

describe('useRasterFilter', () => {
  afterEach(() => jest.clearAllMocks());

  it('requests GET /raster-filters/:id without caching', () => {
    renderHook(() => useRasterFilter('land_cover'));

    expect(useApiQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/raster-filters/land_cover',
        method: 'GET',
        queryKey: ['rasterFilter', 'land_cover'],
        enabled: true,
        disableCache: true,
      }),
    );
  });

  it('is disabled without an id', () => {
    renderHook(() => useRasterFilter(null));

    expect(useApiQueryMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  describe('retry', () => {
    const getRetry = () => {
      renderHook(() => useRasterFilter('land_cover'));
      return useApiQueryMock.mock.calls[0][0].retry;
    };

    it.each([400, 403, 404])('does not retry a %s response', status => {
      expect(getRetry()(0, { status })).toBe(false);
    });

    it('retries a server error up to 3 times', () => {
      const retry = getRetry();

      expect(retry(0, { status: 500 })).toBe(true);
      expect(retry(2, { status: 500 })).toBe(true);
      expect(retry(3, { status: 500 })).toBe(false);
    });

    it('retries a network error without a status', () => {
      expect(getRetry()(0, new Error('Failed to fetch'))).toBe(true);
    });
  });

  it('does not poll by default', () => {
    renderHook(() => useRasterFilter('land_cover'));

    expect(useApiQueryMock.mock.calls[0][0].refetchInterval).toBeUndefined();
  });

  describe('with pollInstall', () => {
    const getRefetchInterval = () => {
      renderHook(() => useRasterFilter('land_cover', { pollInstall: true }));
      return useApiQueryMock.mock.calls[0][0].refetchInterval;
    };

    it('polls every 2 seconds before the first response', () => {
      expect(getRefetchInterval()(queryWithStatus())).toBe(2000);
    });

    it('stops polling once the request fails', () => {
      expect(getRefetchInterval()(failedQuery)).toBe(false);
    });

    it.each([RasterFilterInstallStatus.QUEUED, RasterFilterInstallStatus.INSTALLING])('keeps polling while the install is %s', status => {
      expect(getRefetchInterval()(queryWithStatus(status))).toBe(2000);
    });

    it.each([RasterFilterInstallStatus.NOT_INSTALLED, RasterFilterInstallStatus.INSTALLED, RasterFilterInstallStatus.FAILED])(
      'stops polling once the install is %s',
      status => {
        expect(getRefetchInterval()(queryWithStatus(status))).toBe(false);
      },
    );
  });
});
