import { type User } from './Token';
import { type SigninPageState } from './signinPageState';

export type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: unknown;
  user?: User | null;
  /**
   * Starts a sign-in. Under OIDC the identity provider sends the user back to the current page, which
   * reloads the app: `pageState` comes back with them through `useRestoredPageState`. Password mode signs
   * in on the page, so it ignores it.
   */
  login: (pageState?: SigninPageState) => void;
  logout: () => void;
  authMode: string;
  /**
   * Whether this deployment can identify individual users by email address, and therefore whether
   * Entitlements granted to an email are reachable at all. True only under OIDC whose access
   * tokens carry an `email` claim — see ADR 0022 and `getEmailFromAccessToken`.
   */
  isEmailBasedAuth: boolean;
};
