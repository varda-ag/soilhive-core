import { renderHook, act } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { useEditFilter } from 'hooks/useEditFilter';
import { useRasterFilter } from 'hooks/useRasterFilter';
import { useUpdateRasterFilterMutation, useUpdateRasterFilterMappingsMutation } from 'hooks/useRasterFilterMutation';
import useNotifications from 'hooks/useNotifications';
import { ADMIN_PATHS } from 'configuration/admin';
import { RasterFilterInstallStatus, type RasterFilter } from 'types/backend';

const mockInvalidateQueries = jest.fn();

jest.mock('react-router', () => ({
  useNavigate: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));

jest.mock('hooks/useRasterFilter', () => ({
  useRasterFilter: jest.fn(),
}));

jest.mock('hooks/useRasterFilterMutation', () => ({
  useUpdateRasterFilterMutation: jest.fn(),
  useUpdateRasterFilterMappingsMutation: jest.fn(),
}));

jest.mock('hooks/useNotifications', () => ({ __esModule: true, default: jest.fn() }));

const navigate = jest.fn();
const showNotification = jest.fn();
const updateFilter = jest.fn();
const saveMappings = jest.fn();

const makeFilter = (overrides?: Partial<RasterFilter>): RasterFilter => ({
  id: 'land_cover',
  name: 'Land Cover',
  description: 'Copernicus land cover',
  enabled: false,
  active: false,
  mappings: null,
  pixel_values: { '1': 50, '2': 100 },
  suggested_mappings: { '1': 'Water' },
  install: { status: RasterFilterInstallStatus.INSTALLED },
  ...overrides,
});

const mockRasterFilter = (data: RasterFilter | undefined, isFetchedAfterMount = true) =>
  (useRasterFilter as jest.Mock).mockReturnValue({ data, isFetchedAfterMount });

describe('useEditFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useNavigate as jest.Mock).mockReturnValue(navigate);
    (useNotifications as jest.Mock).mockReturnValue({ showNotification });
    updateFilter.mockResolvedValue({});
    saveMappings.mockResolvedValue({});
    (useUpdateRasterFilterMutation as jest.Mock).mockReturnValue({ mutateAsync: updateFilter, isPending: false });
    (useUpdateRasterFilterMappingsMutation as jest.Mock).mockReturnValue({ mutateAsync: saveMappings, isPending: false });
    mockRasterFilter(makeFilter());
  });

  it('polls the filter until its install ends', () => {
    renderHook(() => useEditFilter('land_cover'));

    expect(useRasterFilter).toHaveBeenCalledWith('land_cover', { pollInstall: true });
  });

  describe('before the first response of this visit', () => {
    it('is loading and ignores data cached from an earlier visit', () => {
      mockRasterFilter(makeFilter({ name: 'Stale name' }), false);
      const { result } = renderHook(() => useEditFilter('land_cover'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.filter).toBeUndefined();
      expect(result.current.formData).toEqual({ name: '', description: '' });
      expect(result.current.mappingRows).toEqual([]);
    });

    it('fills the form once the fresh data arrives', () => {
      mockRasterFilter(makeFilter({ name: 'Stale name' }), false);
      const { result, rerender } = renderHook(() => useEditFilter('land_cover'));

      mockRasterFilter(makeFilter({ name: 'Fresh name' }));
      rerender();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.formData).toEqual({ name: 'Fresh name', description: 'Copernicus land cover' });
    });
  });

  describe('while the install runs', () => {
    it.each([RasterFilterInstallStatus.QUEUED, RasterFilterInstallStatus.INSTALLING])('reports %s as installing', status => {
      mockRasterFilter(makeFilter({ install: { status, progress_percentage: 40 } }));
      const { result } = renderHook(() => useEditFilter('land_cover'));

      expect(result.current.isInstalling).toBe(true);
      expect(result.current.isInstalled).toBe(false);
      expect(result.current.installProgress).toBe(40);
      expect(result.current.isSaveEnabled).toBe(false);
    });

    it('does not overwrite what the user typed when a poll returns', () => {
      mockRasterFilter(makeFilter({ install: { status: RasterFilterInstallStatus.INSTALLING } }));
      const { result, rerender } = renderHook(() => useEditFilter('land_cover'));

      act(() => result.current.handleChange('name', 'Land Cover 2024'));
      mockRasterFilter(makeFilter());
      rerender();

      expect(result.current.formData.name).toBe('Land Cover 2024');
    });
  });

  describe('when the install failed', () => {
    beforeEach(() => mockRasterFilter(makeFilter({ install: { status: RasterFilterInstallStatus.FAILED } })));

    it('shows an error notification', () => {
      renderHook(() => useEditFilter('land_cover'));

      expect(showNotification).toHaveBeenCalledWith({
        id: 'createFilterFailed-land_cover',
        title: 'Filter installation failed',
        message: 'The filter could not be installed. Delete it from the list and add it again.',
        type: 'error',
      });
    });

    it('refreshes the list and goes back to it', () => {
      renderHook(() => useEditFilter('land_cover'));

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['rasterFilters'] });
      expect(navigate).toHaveBeenCalledWith(ADMIN_PATHS.FILTERS, { replace: true });
    });
  });

  describe('once installed', () => {
    it('fills the form and the label rows from the filter', () => {
      const { result } = renderHook(() => useEditFilter('land_cover'));

      expect(result.current.isInstalled).toBe(true);
      expect(result.current.isInstalling).toBe(false);
      expect(result.current.formData).toEqual({ name: 'Land Cover', description: 'Copernicus land cover' });
      expect(result.current.mappingRows).toEqual([
        { pixelValue: '1', label: 'Water' },
        { pixelValue: '2', label: '' },
      ]);
    });

    it('reports whether the filter is enabled', () => {
      mockRasterFilter(makeFilter({ enabled: true }));
      const { result } = renderHook(() => useEditFilter('land_cover'));

      expect(result.current.isEnabled).toBe(true);
    });

    it('disables save while the name or the description is empty', () => {
      const { result } = renderHook(() => useEditFilter('land_cover'));

      expect(result.current.isSaveEnabled).toBe(true);

      act(() => result.current.handleChange('description', ' '));

      expect(result.current.isSaveEnabled).toBe(false);
    });

    it('disables save while a save is pending', () => {
      (useUpdateRasterFilterMappingsMutation as jest.Mock).mockReturnValue({ mutateAsync: saveMappings, isPending: true });
      const { result } = renderHook(() => useEditFilter('land_cover'));

      expect(result.current.isSaveEnabled).toBe(false);
    });

    it('saves only the labels when the name and the description are unchanged', async () => {
      const { result } = renderHook(() => useEditFilter('land_cover'));

      act(() => result.current.handleLabelChange('2', 'Trees'));
      await act(() => result.current.handleSave());

      expect(updateFilter).not.toHaveBeenCalled();
      expect(saveMappings).toHaveBeenCalledWith({ '1': 'Water', '2': 'Trees' });
    });

    it('patches the trimmed name and description first when they changed', async () => {
      const { result } = renderHook(() => useEditFilter('land_cover'));

      act(() => result.current.handleChange('name', ' Land Cover 2024 '));
      await act(() => result.current.handleSave());

      expect(updateFilter).toHaveBeenCalledWith({ name: 'Land Cover 2024', description: 'Copernicus land cover' });
      expect(updateFilter.mock.invocationCallOrder[0]).toBeLessThan(saveMappings.mock.invocationCallOrder[0]);
    });

    it('leaves cleared labels out of the saved mappings', async () => {
      const { result } = renderHook(() => useEditFilter('land_cover'));

      act(() => result.current.clearLabel('1'));
      await act(() => result.current.handleSave());

      expect(saveMappings).toHaveBeenCalledWith({});
    });

    it('refreshes the list and goes back to it after saving', async () => {
      const { result } = renderHook(() => useEditFilter('land_cover'));

      await act(() => result.current.handleSave());

      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['rasterFilters'] });
      expect(navigate).toHaveBeenCalledWith(ADMIN_PATHS.FILTERS);
    });

    it('stays on the page when saving fails', async () => {
      saveMappings.mockRejectedValue(new Error('400'));
      const { result } = renderHook(() => useEditFilter('land_cover'));

      await act(() => result.current.handleSave());

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
