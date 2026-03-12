import { getToken } from './tokenStore';

export const TokenScopes = {
  SUPER_ADMIN: 'super-admin',
  DATA_ADMIN: 'data-admin',
  // future: REVIEWER: 'reviewer',
} as const;

export type Role = (typeof TokenScopes)[keyof typeof TokenScopes];

export function decodeTokenScope(): Role[] {
  const raw = getToken();
  if (!raw) return [];

  try {
    const payload = JSON.parse(atob(raw.split('.')[1]));
    const tokenScopes = ((payload.scope as string) ?? '').split(' '); // scopes are case sensitive.

    return Object.values(TokenScopes).filter(role => tokenScopes.includes(role));
  } catch {
    return [];
  }
}
