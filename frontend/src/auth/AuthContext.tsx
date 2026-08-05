import { type User } from './Token';

export type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: unknown;
  user?: User | null;
  login: (password?: string) => void;
  logout: () => void;
  authMode: string;
  /**
   * Whether this deployment can identify individual users by email address, and therefore whether
   * Entitlements granted to an email are reachable at all. True only under OIDC whose access
   * tokens carry an `email` claim — see ADR 0022 and `getEmailFromAccessToken`.
   */
  isEmailBasedAuth: boolean;
};
