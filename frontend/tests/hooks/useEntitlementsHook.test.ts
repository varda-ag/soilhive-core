import { renderHook } from '@testing-library/react';
import { useEntitlements, DELETE_DATASET, DATASET_PUBLICATIONS } from 'hooks/useEntitlementsHook';
import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { decodeTokenFromString } from '../../src/auth/tokenScopes';

let mockFeatureFlags: string | undefined;

jest.mock('utilities/environmentVariables', () => ({
  __esModule: true,
  get FEATURE_FLAGS() {
    return mockFeatureFlags;
  },
}));

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('../../src/auth/tokenScopes', () => ({
  decodeTokenFromString: jest.fn(),
}));

describe('useEntitlements - DISABLE_DELETE_DATASET feature flag', () => {
  const setAuthenticatedAs = (roles: string[]) => {
    (useAuthContext as jest.Mock).mockReturnValue({ user: { access_token: 'token' } });
    (decodeTokenFromString as jest.Mock).mockReturnValue(roles);
  };

  beforeEach(() => {
    mockFeatureFlags = undefined;
    setAuthenticatedAs(['data-admin']);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('allows DELETE_DATASET for a data-admin when the flag is not set', () => {
    mockFeatureFlags = undefined;
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.can(DELETE_DATASET)).toBe(true);
  });

  it('allows DELETE_DATASET when FEATURE_FLAGS contains an unrelated flag', () => {
    mockFeatureFlags = 'SOME_OTHER_FLAG';
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.can(DELETE_DATASET)).toBe(true);
  });

  it('denies DELETE_DATASET for a data-admin when FEATURE_FLAGS is DISABLE_DELETE_DATASET', () => {
    mockFeatureFlags = 'DISABLE_DELETE_DATASET';
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.can(DELETE_DATASET)).toBe(false);
  });

  it('denies DELETE_DATASET when DISABLE_DELETE_DATASET is one of several comma-separated flags', () => {
    mockFeatureFlags = 'SOME_OTHER_FLAG,DISABLE_DELETE_DATASET';
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.can(DELETE_DATASET)).toBe(false);
  });

  it('denies DELETE_DATASET for a super-admin when the flag is set (overrides universal access)', () => {
    setAuthenticatedAs(['super-admin']);
    mockFeatureFlags = 'DISABLE_DELETE_DATASET';
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.can(DELETE_DATASET)).toBe(false);
  });

  it('does not affect other actions when DISABLE_DELETE_DATASET is set', () => {
    mockFeatureFlags = 'DISABLE_DELETE_DATASET';
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.can(DATASET_PUBLICATIONS)).toBe(true);
  });

  it('keeps DELETE_DATASET denied for a non-admin regardless of the flag', () => {
    setAuthenticatedAs([]);
    mockFeatureFlags = undefined;
    const { result } = renderHook(() => useEntitlements());
    expect(result.current.can(DELETE_DATASET)).toBe(false);
  });
});
