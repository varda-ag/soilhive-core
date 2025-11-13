export const TokenScopes = {
  SUPER_ADMIN: "super-admin",
  DATA_ADMIN: "data-admin",
} as const;

export type TokenScopesType = (typeof TokenScopes)[keyof typeof TokenScopes];

export const ReservedConfigs = {
  AUTH: "auth",
} as const;

export type ReservedConfigsType = (typeof ReservedConfigs)[keyof typeof ReservedConfigs];

export const AuthModes = {
  NONE: "none",
  PASSWORD: "password",
  OIDC: "oidc",
} as const;

export type AuthModesType = (typeof AuthModes)[keyof typeof AuthModes];
