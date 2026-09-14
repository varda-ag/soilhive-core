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
import { Capability, EntitlementScope } from 'types/backend';

jest.mock('../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('hooks/useApiQuery', () => ({
  useApiQuery: jest.fn(),
}));

import { useAuthContext } from '../../src/auth/AuthContextProvider';
import { AuthModes } from '../../src/auth/types';
import { useApiQuery } from 'hooks/useApiQuery';
const mockUseAuthContext = useAuthContext as jest.MockedFunction<typeof useAuthContext>;
const mockUseApiQuery = useApiQuery as jest.MockedFunction<typeof useApiQuery>;

const makeUser = (scope: string): User => ({
  access_token: `header.${btoa(JSON.stringify({ scope }))}.signature`,
});

const baseAuthContext: ReturnType<typeof useAuthContext> = {
  isEmailBasedAuth: false,
  isAuthenticated: false,
  isLoading: false,
  login: jest.fn(),
  logout: jest.fn(),
  authMode: AuthModes.NONE,
  error: undefined,
  user: undefined,
};

describe('useEntitlements', () => {
  beforeEach(() => {
    mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: false } as any);
  });

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

    it('can access every data admin actions', () => {
      const { result } = renderHook(() => useEntitlements());

      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(true);
      expect(result.current.can(MAP_BASED_FILTERS)).toBe(true);
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

  describe('Capability.DOWNLOAD/Capability.PREVIEW (entity-scoped actions)', () => {
    beforeEach(() => {
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user: makeUser('openid email profile') });
    });

    it('throws when entityId is missing (checked before the scope requirement)', () => {
      const { result } = renderHook(() => useEntitlements(EntitlementScope.DATASETS));

      expect(() => result.current.can(Capability.DOWNLOAD)).toThrow('Action download requires an entityId.');
      expect(() => result.current.can(Capability.PREVIEW)).toThrow('Action preview requires an entityId.');
    });

    it('throws when useEntitlements was called without a scope, given an entityId (see ADR-0033)', () => {
      const { result } = renderHook(() => useEntitlements());

      expect(() => result.current.can(Capability.DOWNLOAD, 'dataset-1')).toThrow(
        'Action download requires useEntitlements to be called with an explicit scope.',
      );
    });

    it('returns false while entitlements are loading, even with an entityId', () => {
      mockUseApiQuery.mockReturnValue({ data: undefined, isLoading: true } as any);

      const { result } = renderHook(() => useEntitlements(EntitlementScope.DATASETS));

      expect(result.current.can(Capability.DOWNLOAD, 'dataset-1')).toBe(false);
      expect(result.current.isLoading).toBe(true);
    });

    it('returns false when the entitlements map has no entry for the entityId', () => {
      mockUseApiQuery.mockReturnValue({ data: {}, isLoading: false } as any);

      const { result } = renderHook(() => useEntitlements(EntitlementScope.DATASETS));

      expect(result.current.can(Capability.DOWNLOAD, 'dataset-1')).toBe(false);
      expect(result.current.can(Capability.PREVIEW, 'dataset-1')).toBe(false);
    });

    it('checks the fetched entitlements map for the given entityId and capability', () => {
      mockUseApiQuery.mockReturnValue({
        data: { 'dataset-1': [Capability.PREVIEW], 'dataset-2': [Capability.DOWNLOAD, Capability.PREVIEW] },
        isLoading: false,
      } as any);

      const { result } = renderHook(() => useEntitlements(EntitlementScope.DATASETS));

      expect(result.current.can(Capability.PREVIEW, 'dataset-1')).toBe(true);
      expect(result.current.can(Capability.DOWNLOAD, 'dataset-1')).toBe(false);
      expect(result.current.can(Capability.DOWNLOAD, 'dataset-2')).toBe(true);
      expect(result.current.can(Capability.PREVIEW, 'dataset-2')).toBe(true);
      expect(result.current.can(Capability.DOWNLOAD, 'not-existing')).toBe(false);
    });

    // Deliberately called with no scope: an admin bypass doesn't need the fetched map at all,
    // so it must not require a scope either (see ADR-0033).
    it.each([['data-admin'], ['super-admin']])(
      'bypasses the entitlements map for a %s, even with no scope, empty map, or while loading',
      role => {
        mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user: makeUser(`openid ${role}`) });
        mockUseApiQuery.mockReturnValue({ data: {}, isLoading: true } as any);

        const { result } = renderHook(() => useEntitlements());

        expect(result.current.can(Capability.DOWNLOAD, 'not-existing')).toBe(true);
        expect(result.current.can(Capability.PREVIEW, 'not-existing')).toBe(true);
      },
    );

    it('still throws for an admin when entityId is missing', () => {
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user: makeUser('openid super-admin') });

      const { result } = renderHook(() => useEntitlements(EntitlementScope.DATASETS));

      expect(() => result.current.can(Capability.DOWNLOAD)).toThrow('Action download requires an entityId.');
    });
  });

  describe('scope parameter (see ADR-0033)', () => {
    beforeEach(() => {
      mockUseAuthContext.mockReturnValue({ ...baseAuthContext, user: makeUser('openid email profile') });
    });

    it('does not fetch when no scope is passed', () => {
      renderHook(() => useEntitlements());

      const calls = mockUseApiQuery.mock.calls;
      const call = calls[calls.length - 1]![0];
      expect(call.enabled).toBe(false);
      expect(call.parameters).toEqual([]);
    });

    it('fetches ?scope=datasets when passed explicitly', () => {
      renderHook(() => useEntitlements(EntitlementScope.DATASETS));

      const calls = mockUseApiQuery.mock.calls;
      const call = calls[calls.length - 1]![0];
      expect(call.enabled).toBe(true);
      expect(call.parameters).toEqual([['scope', EntitlementScope.DATASETS]]);
      expect(call.queryKey).toEqual(['entitlements', EntitlementScope.DATASETS]);
    });

    it('an explicit different scope hits ?scope=configs and produces an independent cache entry', () => {
      renderHook(() => useEntitlements(EntitlementScope.CONFIGS));

      const calls = mockUseApiQuery.mock.calls;
      const call = calls[calls.length - 1]![0];
      expect(call.enabled).toBe(true);
      expect(call.parameters).toEqual([['scope', EntitlementScope.CONFIGS]]);
      expect(call.queryKey).toEqual(['entitlements', EntitlementScope.CONFIGS]);
      expect(call.queryKey).not.toEqual(['entitlements', EntitlementScope.DATASETS]);
    });
  });
});
