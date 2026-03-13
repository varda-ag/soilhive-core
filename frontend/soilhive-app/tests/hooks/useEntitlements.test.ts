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

// helper — base64 encodes a fake JWT payload
const makeUser = (scope: string): User => ({
  access_token: `header.${btoa(JSON.stringify({ scope }))}.signature`,
});

describe('useEntitlements', () => {
  describe('unauthenticated user', () => {
    it('is denied access to all actions', () => {
      const { result } = renderHook(() => useEntitlements()); // no user passed

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(false);
      expect(result.current.can(MAP_SETTINGS)).toBe(false);
      expect(result.current.can(LOOK_AND_FEEL)).toBe(false);
      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(false);
      expect(result.current.can(MAP_BASED_FILTERS)).toBe(false);
    });
  });

  describe('authenticated user with no roles', () => {
    it('is denied access to all actions', () => {
      const { result } = renderHook(() => useEntitlements(makeUser('openid email profile')));

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(false);
      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(false);
    });
  });

  describe('super admin', () => {
    const user = makeUser('openid super-admin');

    it('can access super admin actions', () => {
      const { result } = renderHook(() => useEntitlements(user));

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(true);
      expect(result.current.can(MAP_SETTINGS)).toBe(true);
      expect(result.current.can(LOOK_AND_FEEL)).toBe(true);
    });

    it('cannot access data admin actions', () => {
      const { result } = renderHook(() => useEntitlements(user));

      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(false);
      expect(result.current.can(MAP_BASED_FILTERS)).toBe(false);
    });
  });

  describe('data admin', () => {
    const user = makeUser('openid data-admin');

    it('can access data admin actions', () => {
      const { result } = renderHook(() => useEntitlements(user));

      expect(result.current.can(DATASET_PUBLICATIONS)).toBe(true);
      expect(result.current.can(MAP_BASED_FILTERS)).toBe(true);
    });

    it('cannot access super admin actions', () => {
      const { result } = renderHook(() => useEntitlements(user));

      expect(result.current.can(TERMS_AND_CONDITIONS)).toBe(false);
      expect(result.current.can(MAP_SETTINGS)).toBe(false);
      expect(result.current.can(LOOK_AND_FEEL)).toBe(false);
    });
  });

  describe('invalid action', () => {
    it('throws for an action not in the matrix', () => {
      const { result } = renderHook(() => useEntitlements(makeUser('super-admin')));

      expect(() => result.current.can(999 as any)).toThrow('Action 999 is not defined in the entitlement matrix.');
    });
  });
});
