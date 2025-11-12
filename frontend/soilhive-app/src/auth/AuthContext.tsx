import { type User } from "./User";

export type AuthContext = {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: unknown;
  user?: User | null;
  login: () => void;
  logout: () => void;
  authMode: string;
};