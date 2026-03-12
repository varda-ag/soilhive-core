import { getToken } from './tokenStore';

export const TokenScopes = {
  SUPER_ADMIN: 'super-admin',
  DATA_ADMIN: 'data-admin',
} as const;

export type DecodedTokenWithHelpers = {
  scope?: string;
  isSuperAdmin: () => boolean;
  isDataAdmin: () => boolean;
};

export function decodeTokenScope(): DecodedTokenWithHelpers | null {
  const raw = getToken();
  if (!raw) return null;

  try {
    const payload = JSON.parse(atob(raw.split('.')[1]));
    return {
      ...payload,
      isSuperAdmin: function () {
        return this.scope?.includes(TokenScopes.SUPER_ADMIN) ?? false;
      },
      isDataAdmin: function () {
        return this.scope?.includes(TokenScopes.DATA_ADMIN) ?? false;
      },
    };
  } catch {
    return null;
  }
}
