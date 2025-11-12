export const TokenScopes = {
  PLATFORM_ADMIN: "platform-admin",
  DATA_ADMIN: "data-admin",
} as const;

export type TokenScopesType = (typeof TokenScopes)[keyof typeof TokenScopes];
