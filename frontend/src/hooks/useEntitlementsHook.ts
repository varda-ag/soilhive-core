import { useCallback, useMemo } from 'react';
import { decodeTokenFromString, type Role } from '../auth/tokenScopes';
import { useAuthContext } from '../auth/AuthContextProvider';
import { FEATURE_FLAGS } from '../utilities/environmentVariables';
import { useApiQuery } from './useApiQuery';
import { Capability, type Entitlements } from 'types/backend';

// Special roles — not in token, resolved at runtime
export const ANYONE = 'anyone' as const;
export const LOGGED_IN = 'logged-in' as const;

// To add a new role, add to TokenScopes.
type SpecialRole = typeof ANYONE | typeof LOGGED_IN;
type AllRoles = Role | SpecialRole;

// Actions
export const TERMS_AND_CONDITIONS = 0;
export const MAP_SETTINGS = 1;
export const LOOK_AND_FEEL = 2;
export const DATASET_PUBLICATIONS = 3;
export const MAP_BASED_FILTERS = 4;
export const ADMIN_PORTAL_ACCESS = 5;
export const ADMIN_PORTAL_UI_MENU = 6;
export const ADMIN_PORTAL_DATA_MENU = 7;
export const DELETE_DATASET = 8;

type Action =
  | typeof TERMS_AND_CONDITIONS
  | typeof MAP_SETTINGS
  | typeof LOOK_AND_FEEL
  | typeof DATASET_PUBLICATIONS
  | typeof MAP_BASED_FILTERS
  | typeof ADMIN_PORTAL_ACCESS
  | typeof ADMIN_PORTAL_UI_MENU
  | typeof ADMIN_PORTAL_DATA_MENU
  | typeof DELETE_DATASET;

// Checked against the fetched entitlements map (by entityId), not the role matrix — the action
// itself is the capability to look up, so no separate action-to-capability mapping is needed.
type EntityScopedAction = Capability.DOWNLOAD | Capability.PREVIEW;

const ENTITLEMENT_MATRIX: Record<Action, AllRoles[]> = {
  [TERMS_AND_CONDITIONS]: [],
  [MAP_SETTINGS]: [],
  [LOOK_AND_FEEL]: [],
  [ADMIN_PORTAL_UI_MENU]: [],
  [DATASET_PUBLICATIONS]: ['data-admin'],
  [MAP_BASED_FILTERS]: ['data-admin'],
  [ADMIN_PORTAL_ACCESS]: ['data-admin'],
  [ADMIN_PORTAL_DATA_MENU]: ['data-admin'],
  [DELETE_DATASET]: ['data-admin'],
};

export function useEntitlements() {
  const { user } = useAuthContext();
  const isAuthenticated = !!user;

  // Memoized on `user` itself (not just its access_token) so the dependency the React Compiler
  // lint rule infers from `user.access_token` matches the one declared here — otherwise it
  // reports the manual memoization as unpreservable.
  const tokenRoles: Role[] = useMemo(() => (user?.access_token ? decodeTokenFromString(user.access_token) : []), [user]);

  const userRoles: AllRoles[] = useMemo(() => [...(isAuthenticated ? [LOGGED_IN] : []), ...tokenRoles], [isAuthenticated, tokenRoles]);

  // Mirrors EntitlementService.isEntitlementsBypassed on the backend — isInternalRequest has no
  // frontend equivalent (that bypass is for service-to-service calls, not browser tokens).
  const isAdminBypassed = userRoles.includes('data-admin') || userRoles.includes('super-admin');

  // GET /entitlements requires a bearer token; for an anonymous user this stays disabled, so
  // `entitlements` is undefined and the entity-scoped checks below fall back to false. Public
  // access for anonymous users is handled separately, via dataset.visibility.
  const { data: entitlements, isLoading } = useApiQuery<Entitlements>({
    endpoint: '/entitlements',
    method: 'GET',
    queryKey: ['entitlements'],
    enabled: isAuthenticated,
  });

  const can = useCallback(
    (action: Action | EntityScopedAction, entityId?: string): boolean => {
      if (action === Capability.DOWNLOAD || action === Capability.PREVIEW) {
        if (!entityId) {
          throw new Error(`Action ${action} requires an entityId.`);
        }
        if (isAdminBypassed) {
          return true;
        }
        if (isLoading) {
          return false;
        }
        return (entitlements?.[entityId] ?? []).includes(action);
      }

      if (!(action in ENTITLEMENT_MATRIX)) {
        throw new Error(`Action ${action} is not defined in the entitlement matrix.`);
      }

      if (FEATURE_FLAGS?.includes('DISABLE_DELETE_DATASET') && action === DELETE_DATASET) {
        return false;
      }

      const allowedRoles = ENTITLEMENT_MATRIX[action];

      if (allowedRoles.includes(ANYONE)) return true;

      // Grants SUPER_ADMIN universal access regardless of matrix
      if (userRoles.includes('super-admin')) return true;

      return allowedRoles.some(role => userRoles.includes(role));
    },
    [isAdminBypassed, isLoading, entitlements, userRoles],
  );

  return { can, isLoading };
}
