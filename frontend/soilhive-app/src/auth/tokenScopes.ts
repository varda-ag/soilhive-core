// File: src/contexts/auth/tokenScopes.ts

import { getToken } from './tokenStore';

export const TokenScopes = {
  SUPER_ADMIN: 'super-admin',
  DATA_ADMIN: 'data-admin',
} as const;

export type Role = (typeof TokenScopes)[keyof typeof TokenScopes];

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

export function decodeTokenScope(): Role[] {
  // for new tab fallback
  const raw = getToken();
  if (!raw) return [];
  return decodeTokenFromString(raw);
}
