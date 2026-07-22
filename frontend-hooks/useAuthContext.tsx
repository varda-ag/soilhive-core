import { createContext, useContext } from 'react';

export type AuthUser = {
  access_token?: string;
  profile?: {
    sub?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
  };
};

export type AuthContextValue = {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: unknown;
  user?: AuthUser | null;
  login: () => void;
  logout: () => void;
  authMode: string;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthContextProvider');
  }
  return context;
}
