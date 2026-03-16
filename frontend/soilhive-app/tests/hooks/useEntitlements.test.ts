import { renderHook } from '@testing-library/react';
import {
  useEntitlements,
  TERMS_AND_CONDITIONS,
  MAP_SETTINGS,
  LOOK_AND_FEEL,
  DATASET_PUBLICATIONS,
  MAP_BASED_FILTERS,
} from 'hooks/useEntitlementsHook';
import type { User } from '../../src/auth/Token';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { AuthModes } from '../../src/auth/types';
const mockUseAuthContext = useAuthContext as jest.MockedFunction<typeof useAuthContext>;

const makeUser = (scope: string): User => ({
  access_token: `header.${btoa(JSON.stringify({ scope }))}.signature`,
});

const baseAuthContext: ReturnType<typeof useAuthContext> = {
  isAuthenticated: false,
  isLoading: false,
  login: jest.fn(),
  logout: jest.fn(),
  authMode: AuthModes.NONE,
  error: undefined,
  user: undefined,
};

describe('useEntitlements', () => {
  describe('unauthenticated user', () => {
    it('is denied access to all actions', () => {
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user: undefined });

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
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user: makeUser('openid email profile') });

      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(false);
      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(false);
    });
  });

  describe('super admin', () => {
    const user = makeUser('openid super-admin');

    beforeEach(() => {
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user });
    });

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
    const user = makeUser('openid data-admin');

    beforeEach(() => {
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user });
    });

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
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user: makeUser('super-admin') });

      const { result } = renderHook(() => useEntitlements());

      expect(() => result.current.can(999 as any)).toThrow('Action 999 is not defined in the entitlement matrix.');
    });
  });
});
