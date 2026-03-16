import { decodeTokenFromString, type Role } from '../auth/tokenScopes';
import { useAuthContext } from '../auth/AuthContextProvider';

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

type Action =
  | typeof TERMS_AND_CONDITIONS
  | typeof MAP_SETTINGS
  | typeof LOOK_AND_FEEL
  | typeof DATASET_PUBLICATIONS
  | typeof MAP_BASED_FILTERS;

const ENTITLEMENT_MATRIX: Record<Action, AllRoles[]> = {
  [TERMS_AND_CONDITIONS]: ['super-admin'],
  [MAP_SETTINGS]: ['super-admin'],
  [LOOK_AND_FEEL]: ['super-admin'],
  [DATASET_PUBLICATIONS]: ['data-admin'],
  [MAP_BASED_FILTERS]: ['data-admin'],
  // NOTE: to grant SUPER_ADMIN access to DATA_ADMIN actions, add 'super-admin' to those rows
  // NOTE: to grant universal SUPER_ADMIN access regardless of matrix, uncomment in can() below
};

export function useEntitlements() {
  const { user } = useAuthContext();
  const isAuthenticated = !!user;
  const tokenRoles: Role[] = user?.access_token ? decodeTokenFromString(user.access_token) : [];

  const userRoles: AllRoles[] = [...(isAuthenticated ? [LOGGED_IN] : []), ...tokenRoles];

  const can = (action: Action): boolean => {
    if (!(action in ENTITLEMENT_MATRIX)) {
      throw new Error(`Action ${action} is not defined in the entitlement matrix.`);
    }

    const allowedRoles = ENTITLEMENT_MATRIX[action];

    if (allowedRoles.includes(ANYONE)) return true;

    // NOTE: uncomment to grant SUPER_ADMIN universal access regardless of matrix
    // if (userRoles.includes('super-admin')) return true;

    return allowedRoles.some(role => userRoles.includes(role));
  };

  return { can };
}
