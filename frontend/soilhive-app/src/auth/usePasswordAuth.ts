import { useState } from 'react';
import type { User } from './Token';
import { useRequest } from '../api-client';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import { clearToken, saveToken } from './tokenStore';
import { BACKEND_BASE_URL } from '../configuration/api';

const TOKEN_STORAGE_KEY = 'soilhive_token';

interface PasswordAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: Error;
  user?: User | null;
}

interface RawToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

function extractUser(rawToken: RawToken): User {
  const decodedToken: JwtPayload = jwtDecode(rawToken.access_token);

  const token: User = {
    scope: (decodedToken as any).scope,
    expires_at: decodedToken.exp,
    access_token: rawToken.access_token,
    profile: {
      iat: decodedToken.iat,
      sub: decodedToken.sub,
      name: decodedToken.sub,
      given_name: (decodedToken as any).given_name,
      family_name: (decodedToken as any).family_name,
      email: (decodedToken as any).email,
    },
  };

  return token;
}

export function usePasswordAuth() {
  const { request } = useRequest();

  // try and load token from the session storage
  const [state, setState] = useState<PasswordAuthState>(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);

    let parsedToken = null;

    if (token) {
      parsedToken = JSON.parse(token);
      saveToken(parsedToken.access_token);
    }

    return {
      isAuthenticated: !!token,
      isLoading: false,
      error: undefined,
      user: parsedToken ? extractUser(parsedToken) : null,
    };
  });

  const login = async (password?: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: undefined }));

    const body = {
      grant_type: 'password',
      username: '_',
      password: password || '',
    };

    const urlEncodedBody = new URLSearchParams(body).toString();

    try {
      const token = await request({
        url: `${BACKEND_BASE_URL}/oauth/token`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: urlEncodedBody,
      });

      localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
      saveToken(token.access_token);

      setState({
        isAuthenticated: true,
        isLoading: false,
        error: undefined,
        user: extractUser(token),
      });
    } catch (error) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        error: error as Error,
        user: null,
      });
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    clearToken();

    setState({
      isAuthenticated: false,
      isLoading: false,
      error: undefined,
      user: null,
    });
  };

  return {
    ...state,
    login,
    logout,
  };
}
