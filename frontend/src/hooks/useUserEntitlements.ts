import type { Entitlements, EntitlementScope } from 'types/backend';
import { useAuthContext } from '../auth/AuthContextProvider';
import { useApiQuery } from './useApiQuery';

// GET /entitlements requires a scope (no "all scopes" response — see backend ADR-0032) and
// returns the caller's own grants map for that namespace, unfiltered by entity.
export function useUserEntitlements(scope: EntitlementScope) {
  const { isAuthenticated } = useAuthContext();

  return useApiQuery<Entitlements>({
    endpoint: '/entitlements',
    method: 'GET',
    parameters: [['scope', scope]],
    queryKey: ['entitlements', scope],
    enabled: isAuthenticated,
  });
}
