import { renderHook } from '@testing-library/react';
import { usePluginContext } from 'hooks/usePluginContext';
import usePluginConfig from 'hooks/usePluginConfig';
import usePluginConfigs from 'hooks/usePluginConfigs';
import { usePluginConfigEntitlements, usePluginConfigEntitlementsMutation } from 'hooks/usePluginConfigEntitlements';
import { usePluginUserEntitlements } from 'hooks/usePluginUserEntitlements';
import { useFilter } from 'hooks/useFilter';
import { useAuthContext } from '../../src/auth/AuthContextProvider';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

// Only useAuthContext is actually invoked by usePluginContext itself, and useFilter
// is exercised through context.useFilter below; the rest are mocked purely to avoid
// pulling in their real (heavy) module graphs at import time.
jest.mock('hooks/useTheme', () => ({ __esModule: true, default: jest.fn() }));
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

const useAuthContextMock = useAuthContext as jest.MockedFunction<typeof useAuthContext>;
const useFilterMock = useFilter as jest.MockedFunction<typeof useFilter>;

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
});
