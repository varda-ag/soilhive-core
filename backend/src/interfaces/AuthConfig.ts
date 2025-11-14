import { AuthModesType } from "../types/types";

export interface OIDCConfig {
  authority: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  silentRedirectUri: string;
  scope: string;
}

export interface AuthConfig {
  authMode: AuthModesType;
  oidcConfig?: OIDCConfig;
}
