import { renderHook } from '@testing-library/react';
import {
  useEntitlements,
  TERMS_AND_CONDITIONS,
  MAP_SETTINGS,
  LOOK_AND_FEEL,
  DATASET_PUBLICATIONS,
  MAP_BASED_FILTERS,
} from 'hooks/useEntitlementsHook';

jest.mock('../../src/auth/tokenStore', () => ({
  getToken: jest.fn(),
}));

jest.mock('../../src/auth/tokenScopes', () => ({
  decodeTokenScope: jest.fn(),
}));

import { getToken } from '../../src/auth/tokenStore';
import { decodeTokenScope } from '../../src/auth/tokenScopes';

const mockGetToken = getToken as jest.Mock;
const mockDecodeTokenScope = decodeTokenScope as jest.Mock;

describe('useEntitlements', () => {
  afterEach(() => jest.clearAllMocks());

  // helpers
  const asUnauthenticated = () => {
    mockGetToken.mockReturnValue(null);
    mockDecodeTokenScope.mockReturnValue([]);
  };

  const asAuthenticated = (roles: string[] = []) => {
    mockGetToken.mockReturnValue('mock-token');
    mockDecodeTokenScope.mockReturnValue(roles);
  };

  describe('unauthenticated user', () => {
    it('is denied access to all actions', () => {
      asUnauthenticated();
      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(false);
      expect(result.current.can(MAP_SETTINGS)).toBe(false);
      expect(result.current.can(LOOK_AND_FEEL)).toBe(false);
      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(false);
      expect(result.current.can(MAP_BASED_FILTERS)).toBe(false);
    });
  });

  describe('authenticated user with no roles', () => {
    it('is denied access to all actions', () => {
      asAuthenticated([]);
      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(false);
      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(false);
    });
  });

  describe('super admin', () => {
    beforeEach(() => asAuthenticated(['super-admin']));

    it('can access super admin actions', () => {
      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(true);
      expect(result.current.can(MAP_SETTINGS)).toBe(true);
      expect(result.current.can(LOOK_AND_FEEL)).toBe(true);
    });

    it('cannot access data admin actions', () => {
      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(false);
      expect(result.current.can(MAP_BASED_FILTERS)).toBe(false);
    });
  });

  describe('data admin', () => {
    beforeEach(() => asAuthenticated(['data-admin']));

    it('can access data admin actions', () => {
      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(true);
      expect(result.current.can(MAP_BASED_FILTERS)).toBe(true);
    });

    it('cannot access super admin actions', () => {
      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(false);
      expect(result.current.can(MAP_SETTINGS)).toBe(false);
      expect(result.current.can(LOOK_AND_FEEL)).toBe(false);
    });
  });

  describe('invalid action', () => {
    it('throws for an action not in the matrix', () => {
      asAuthenticated(['super-admin']);
      const { result } = renderHook(() => useEntitlements());

      expect(() => result.current.can(999 as any)).toThrow('Action 999 is not defined in the entitlement matrix.');
    });
  });
});
