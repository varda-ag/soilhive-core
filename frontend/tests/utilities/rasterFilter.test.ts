import { getInstallStatus, isInstallInProgress, isOfferedRasterFilter, IN_PROGRESS_INSTALL_STATUSES } from 'utilities/rasterFilter';
import { RasterFilterInstallStatus, type RasterFilterCategory } from 'types/backend';

const makeFilter = (overrides?: Partial<RasterFilterCategory>): RasterFilterCategory => ({
  id: 'land_cover',
  name: 'Land Cover',
  description: '',
  enabled: false,
  active: false,
  mappings: null,
  created_at: '2024-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  ...overrides,
});

describe('rasterFilter utilities', () => {
  describe('getInstallStatus', () => {
    it('returns the status of the install report', () => {
      expect(getInstallStatus(makeFilter({ install: { status: RasterFilterInstallStatus.INSTALLING } }))).toBe(
        RasterFilterInstallStatus.INSTALLING,
      );
    });

    it('returns not installed when the filter has no install report', () => {
      expect(getInstallStatus(makeFilter())).toBe(RasterFilterInstallStatus.NOT_INSTALLED);
    });
  });

  describe('isInstallInProgress', () => {
    it.each([RasterFilterInstallStatus.QUEUED, RasterFilterInstallStatus.INSTALLING])('is true for %s', status => {
      expect(isInstallInProgress(status)).toBe(true);
    });

    it.each([RasterFilterInstallStatus.NOT_INSTALLED, RasterFilterInstallStatus.INSTALLED, RasterFilterInstallStatus.FAILED])(
      'is false for %s',
      status => {
        expect(isInstallInProgress(status)).toBe(false);
      },
    );

    it('agrees with IN_PROGRESS_INSTALL_STATUSES', () => {
      expect(IN_PROGRESS_INSTALL_STATUSES).toEqual([RasterFilterInstallStatus.QUEUED, RasterFilterInstallStatus.INSTALLING]);
    });
  });

  describe('isOfferedRasterFilter', () => {
    it.each([
      [true, true, true],
      [true, false, false],
      [false, true, false],
      [false, false, false],
    ])('enabled %s and active %s gives %s', (enabled, active, expected) => {
      expect(isOfferedRasterFilter(makeFilter({ enabled, active }))).toBe(expected);
    });
  });
});
