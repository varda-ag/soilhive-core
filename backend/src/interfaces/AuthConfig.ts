import { AuthModes } from '../types/enums';

export interface OIDCConfig {
  authority: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  silentRedirectUri: string;
  scope: string;
}

export interface AuthConfig {
  authMode: AuthModes;
  oidcConfig?: OIDCConfig;
}
