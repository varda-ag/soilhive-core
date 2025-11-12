import { type Token } from "./Token";

export type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: unknown;
  token?: Token | null;
  login: (password?: string) => void;
  logout: () => void;
  authMode: string;
};