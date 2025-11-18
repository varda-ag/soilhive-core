import { type User } from "./Token";

export type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: unknown;
  user?: User | null;
  login: (password?: string) => void;
  logout: () => void;
  authMode: string;
};