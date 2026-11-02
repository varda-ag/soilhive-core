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

    it.each([RasterFilterInstallStatus.NOT_INSTALLED, RasterFilterInstallStatus.QUEUED, RasterFilterInstallStatus.INSTALLING])(
      'keeps polling while the install is %s',
      status => {
        expect(getRefetchInterval()(queryWithStatus(status))).toBe(2000);
      },
    );

    it.each([RasterFilterInstallStatus.INSTALLED, RasterFilterInstallStatus.FAILED])('stops polling once the install is %s', status => {
      expect(getRefetchInterval()(queryWithStatus(status))).toBe(false);
    });
  });
});
