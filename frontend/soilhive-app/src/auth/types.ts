export const AuthModes = {
  NONE: "none",
  PASSWORD: "password",
  OIDC: "oidc",
} as const;

export type AuthModesType = (typeof AuthModes)[keyof typeof AuthModes];