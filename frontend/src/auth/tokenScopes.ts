import { jwtDecode } from 'jwt-decode';

export const TokenScopes = {
  SUPER_ADMIN: 'super-admin',
  DATA_ADMIN: 'data-admin',
} as const;

export type Role = (typeof TokenScopes)[keyof typeof TokenScopes];

/** A data-admin or super-admin token: a Privileged caller to the backend. */
export const isAdminToken = (accessToken: string): boolean => {
  const roles = decodeTokenFromString(accessToken);
  return roles.includes(TokenScopes.SUPER_ADMIN) || roles.includes(TokenScopes.DATA_ADMIN);
};

// Read as the backend reads it (hasScope): a space-separated string, or the array some identity
// providers send. Missing an admin here is the risky way round: the plugin then tells an admin that
// a delete only removes the item from their list, while the backend deletes it for everyone.
function parseScope(scope: unknown): Role[] {
  const entries: unknown[] = Array.isArray(scope) ? scope : typeof scope === 'string' ? scope.split(/\s+/) : [];
  const tokenScopes = entries.filter((entry): entry is string => typeof entry === 'string').map(entry => entry.toLowerCase());
  return Object.values(TokenScopes).filter(role => tokenScopes.includes(role));
}

export function decodeTokenFromString(accessToken: string): Role[] {
  // for auth context usage. jwtDecode reads the payload as base64url; atob alone rejects one holding
  // a - or _, which a non-ASCII claim such as a name can produce.
  try {
    return parseScope(jwtDecode<{ scope?: unknown }>(accessToken).scope);
  } catch {
    return [];
  }
}
