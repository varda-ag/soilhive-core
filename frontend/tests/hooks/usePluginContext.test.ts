import { act, renderHook } from '@testing-library/react';
import { usePluginContext } from 'hooks/usePluginContext';
import usePluginConfig from 'hooks/usePluginConfig';
import usePluginConfigs from 'hooks/usePluginConfigs';
import { usePluginConfigEntitlements, usePluginConfigEntitlementsMutation } from 'hooks/usePluginConfigEntitlements';
import { usePluginUserEntitlements } from 'hooks/usePluginUserEntitlements';
import { useFilter } from 'hooks/useFilter';
import useTheme from 'hooks/useTheme';
import useNotifications from 'hooks/useNotifications';
import { useDataFilterQuery } from 'hooks/useDataFilterQuery';
import { useFilteredCoverageQuery } from 'hooks/useFilteredCoverageQuery';
import { useRaster } from 'hooks/useRaster';
import { usePluginDataRequest, usePluginDataRequestDelete, usePluginDataRequestSubmit } from 'hooks/usePluginDataRequest';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

// Only useAuthContext is actually invoked by usePluginContext itself; useFilter, useTheme,
// useDataFilterQuery, useFilteredCoverageQuery and useRaster are exercised through the
// context below, and the rest are mocked purely to avoid pulling in their real (heavy)
// module graphs at import time.
jest.mock('hooks/useTheme', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/useNotifications', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/useDataFilterQuery', () => ({ useDataFilterQuery: jest.fn() }));
jest.mock('hooks/useFilteredCoverageQuery', () => ({ useFilteredCoverageQuery: jest.fn() }));
jest.mock('hooks/usePropertiesCategories', () => ({ usePropertiesCategories: jest.fn() }));
jest.mock('hooks/useRaster', () => ({ useRaster: jest.fn() }));
jest.mock('hooks/useSoilData', () => ({ useSoilData: jest.fn() }));
jest.mock('hooks/useSoilProperties', () => ({ useSoilProperties: jest.fn() }));
// usePluginConfig transitively imports useConfig -> App -> i18n's real (heavy) module
// graph; mock it like the other host hooks above so importing usePluginContext stays cheap.
jest.mock('hooks/usePluginConfig', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/usePluginConfigs', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('hooks/usePluginConfigEntitlements', () => ({
  usePluginConfigEntitlements: jest.fn(),
  usePluginConfigEntitlementsMutation: jest.fn(),
}));
jest.mock('hooks/usePluginUserEntitlements', () => ({ usePluginUserEntitlements: jest.fn() }));
jest.mock('hooks/useFilter', () => ({ useFilter: jest.fn() }));
jest.mock('hooks/usePluginDataRequest', () => ({
  usePluginDataRequest: jest.fn(),
  usePluginDataRequestSubmit: jest.fn(),
  usePluginDataRequestDelete: jest.fn(),
}));

const useAuthContextMock = useAuthContext as jest.MockedFunction<typeof useAuthContext>;
const useFilterMock = useFilter as jest.MockedFunction<typeof useFilter>;
const useThemeMock = useTheme as jest.MockedFunction<typeof useTheme>;
const useNotificationsMock = useNotifications as jest.MockedFunction<typeof useNotifications>;
const useDataFilterQueryMock = useDataFilterQuery as jest.MockedFunction<typeof useDataFilterQuery>;
const useFilteredCoverageQueryMock = useFilteredCoverageQuery as jest.MockedFunction<typeof useFilteredCoverageQuery>;
const useRasterMock = useRaster as jest.MockedFunction<typeof useRaster>;

const MOCK_AUTH_CONTEXT = {
  isEmailBasedAuth: false,
  isAuthenticated: false,
  isLoading: false,
  login: jest.fn(),
  logout: jest.fn(),
  authMode: 'NONE',
};

describe('usePluginContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthContextMock.mockReturnValue({ ...MOCK_AUTH_CONTEXT, user: null });
  });

  it('passes usePluginConfig through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfig).toBe(usePluginConfig);
  });

  it('passes usePluginConfigs through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfigs).toBe(usePluginConfigs);
  });

  it('passes usePluginConfigEntitlements through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfigEntitlements).toBe(usePluginConfigEntitlements);
  });

  it('passes usePluginConfigEntitlementsMutation through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginConfigEntitlementsMutation).toBe(usePluginConfigEntitlementsMutation);
  });

  it('passes usePluginUserEntitlements through unchanged, since its signature already matches PluginContext', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.usePluginUserEntitlements).toBe(usePluginUserEntitlements);
  });

  it('maps useFilter to a PluginQueryResult, never leaking the owner', () => {
    const geometry: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    useFilterMock.mockReturnValue({
      filter: {
        id: 'abc',
        name: 'My filter',
        owner: 'owner-123',
        filter: { geometries: [geometry], parameters: { soil_properties: ['ph'] } },
      },
      isLoading: false,
      isError: false,
    });

    const { result: context } = renderHook(() => usePluginContext());
    const { result } = renderHook(() => context.current.useFilter('abc'));

    expect(useFilterMock).toHaveBeenCalledWith('abc');
    expect(result.current).toEqual({
      data: {
        id: 'abc',
        name: 'My filter',
        filter: { geometries: [geometry], parameters: { soil_properties: ['ph'] } },
      },
      isLoading: false,
      isError: false,
    });
    expect(JSON.stringify(result.current)).not.toContain('owner');
  });

  it('returns undefined data from useFilter while no filter is loaded', () => {
    useFilterMock.mockReturnValue({ filter: undefined, isLoading: true, isError: false });

    const { result: context } = renderHook(() => usePluginContext());
    const { result } = renderHook(() => context.current.useFilter(undefined));

    expect(result.current).toEqual({ data: undefined, isLoading: true, isError: false });
  });

  it.each([
    { name: 'theme config errors', isThemeConfigError: true, isLogoError: false },
    { name: 'logo errors', isThemeConfigError: false, isLogoError: true },
  ])('maps useTheme to a PluginQueryResult with isError true when $name', ({ isThemeConfigError, isLogoError }) => {
    const colors = { primary: '#111111' };
    useThemeMock.mockReturnValue({
      themeConfig: { colors },
      logo: 'blob:logo-url',
      isLoadingThemeConfig: false,
      isLogoLoading: true,
      isThemeConfigError,
      isLogoError,
    } as any);

    const { result: context } = renderHook(() => usePluginContext());
    const { result } = renderHook(() => context.current.useTheme());

    expect(result.current).toEqual({ data: { colors, logoUrl: 'blob:logo-url' }, isLoading: true, isError: true });
  });

  it('does not flag useTheme as errored when there is no logo', () => {
    useThemeMock.mockReturnValue({
      themeConfig: { colors: {} },
      logo: null,
      isLoadingThemeConfig: false,
      isLogoLoading: false,
      isThemeConfigError: false,
      isLogoError: false,
    } as any);

    const { result: context } = renderHook(() => usePluginContext());
    const { result } = renderHook(() => context.current.useTheme());

    expect(result.current).toEqual({ data: { colors: {}, logoUrl: null }, isLoading: false, isError: false });
  });

  it('forwards isLoading and isError from useDataFilterQuery', () => {
    useDataFilterQueryMock.mockReturnValue({ filterId: undefined, selectedFilters: undefined, isLoading: true, isError: true });

    const { result: context } = renderHook(() => usePluginContext());
    const { result } = renderHook(() => context.current.useDataFilterQuery({ geometries: [], parameters: {} }));

    expect(result.current).toEqual({ data: undefined, isLoading: true, isError: true });
  });

  it('forwards isLoading and isError from useFilteredCoverageQuery', () => {
    useFilteredCoverageQueryMock.mockReturnValue({ data: undefined, isLoading: true, isError: true });

    const { result: context } = renderHook(() => usePluginContext());
    const { result } = renderHook(() => context.current.useFilteredCoverageQuery('abc'));

    expect(useFilteredCoverageQueryMock).toHaveBeenCalledWith('abc', undefined);
    expect(result.current).toEqual({ data: undefined, isLoading: true, isError: true });
  });

  it('forwards isLoading and isError from useRaster as useRasterCategories', () => {
    useRasterMock.mockReturnValue({ allCategories: undefined, isLoading: true, isError: true, setCategoryActive: jest.fn() });

    const { result: context } = renderHook(() => usePluginContext());
    const { result } = renderHook(() => context.current.useRasterCategories());

    expect(result.current).toEqual({ data: undefined, isLoading: true, isError: true });
  });

  it('exposes the three Data Request hooks', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current.useDataRequestSubmit).toBe(usePluginDataRequestSubmit);
    expect(result.current.useDataRequest).toBe(usePluginDataRequest);
    expect(result.current.useDataRequestDelete).toBe(usePluginDataRequestDelete);
  });

  it('narrows user to profile name/email only, never leaking tokens', () => {
    useAuthContextMock.mockReturnValue({
      ...MOCK_AUTH_CONTEXT,
      isAuthenticated: true,
      user: {
        access_token: 'secret-access-token',
        refresh_token: 'secret-refresh-token',
        id_token: 'secret-id-token',
        profile: { name: 'Ada Lovelace', email: 'ada@example.com', sub: 'user-123' },
      },
    });

    const { result } = renderHook(() => usePluginContext());

    expect(result.current.user).toEqual({ profile: { name: 'Ada Lovelace', email: 'ada@example.com' } });
    expect(JSON.stringify(result.current.user)).not.toContain('secret-');
  });

  it('does not expose mapSelection: plugins read a stored filter by id via useFilter instead', () => {
    const { result } = renderHook(() => usePluginContext());

    expect(result.current).not.toHaveProperty('mapSelection');
  });

  describe('useNotifications', () => {
    const hostShow = jest.fn();

    beforeEach(() => {
      useNotificationsMock.mockReturnValue({ notifications: [], showNotification: hostShow, removeNotification: jest.fn() });
    });

    const renderNotifications = (pluginId = 'my-plugin') => {
      const { result: context } = renderHook(() => usePluginContext());
      return renderHook(({ id }) => context.current.useNotifications(id), { initialProps: { id: pluginId } });
    };

    it('namespaces a given id under plugin:{pluginId}: and passes the rest through', () => {
      const { result } = renderNotifications();

      act(() => result.current.showNotification({ id: 'saved', title: 'Saved', message: 'Done', type: 'success' }));

      expect(hostShow).toHaveBeenCalledWith({ id: 'plugin:my-plugin:saved', title: 'Saved', message: 'Done', type: 'success' });
    });

    it('generates a distinct namespaced id per call when none is given', () => {
      const { result } = renderNotifications();

      act(() => result.current.showNotification({ title: 'A', type: 'error' }));
      act(() => result.current.showNotification({ title: 'B', type: 'error' }));

      const [first, second] = hostShow.mock.calls.map(([n]) => n.id);
      expect(first).toMatch(/^plugin:my-plugin:auto-\d+$/);
      expect(second).toMatch(/^plugin:my-plugin:auto-\d+$/);
      expect(first).not.toBe(second);
    });

    it('keeps showNotification stable when the host callback changes identity', () => {
      const { result, rerender } = renderNotifications();
      const initial = result.current.showNotification;
      const nextHostShow = jest.fn();
      useNotificationsMock.mockReturnValue({ notifications: [], showNotification: nextHostShow, removeNotification: jest.fn() });

      rerender({ id: 'my-plugin' });
      act(() => result.current.showNotification({ id: 'x', title: 'X', type: 'warning' }));

      expect(result.current.showNotification).toBe(initial);
      expect(nextHostShow).toHaveBeenCalledWith({ id: 'plugin:my-plugin:x', title: 'X', type: 'warning' });
    });

    it("exposes only showNotification, never the host's list or removeNotification", () => {
      const { result } = renderNotifications();

      expect(Object.keys(result.current)).toEqual(['showNotification']);
    });
  });
});
