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

function parseScope(scope: string): Role[] {
  const tokenScopes = scope.toLowerCase().split(' ');
  return Object.values(TokenScopes).filter(role => tokenScopes.includes(role));
}

export function decodeTokenFromString(accessToken: string): Role[] {
  // for auth context usage
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    return parseScope(payload.scope ?? '');
  } catch {
    return [];
  }
}
