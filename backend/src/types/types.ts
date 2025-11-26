export const TokenScopes = {
  SUPER_ADMIN: "super-admin",
  DATA_ADMIN: "data-admin",
} as const;

export type TokenScopesType = (typeof TokenScopes)[keyof typeof TokenScopes];

export const AuthModes = {
  NONE: "none",
  PASSWORD: "password",
  OIDC: "oidc",
} as const;

export type AuthModesType = (typeof AuthModes)[keyof typeof AuthModes];

export const StorageModes = {
  LOCAL: "local",
  S3: "s3",
  AZURE: "azure",
  GCP: "gcp",
} as const;

export type StorageModesType = (typeof StorageModes)[keyof typeof StorageModes];
