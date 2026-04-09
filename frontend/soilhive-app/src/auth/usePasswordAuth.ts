import { useState } from 'react';
import type { User } from './Token';
import { useRequest } from '../api-client';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import { clearToken, getToken, saveToken } from './tokenStore';
import { BACKEND_BASE_URL } from '../configuration/api';

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

function extractUser(access_token: string): User {
  const decodedToken: JwtPayload = jwtDecode(access_token);

  const user: User = {
    scope: (decodedToken as any).scope,
    expires_at: decodedToken.exp,
    access_token,
    profile: {
      iat: decodedToken.iat,
      sub: decodedToken.sub,
      name: decodedToken.sub,
      given_name: (decodedToken as any).given_name,
      family_name: (decodedToken as any).family_name,
      email: (decodedToken as any).email,
    },
  };

  return user;
}

function isTokenExpired(user: User): boolean {
  const EXPIRY_BUFFER_SECONDS = 30;
  return user.expires_at ? user.expires_at * 1000 < Date.now() + EXPIRY_BUFFER_SECONDS * 1000 : true;
}

export function usePasswordAuth() {
  const { request } = useRequest();

  // try and load token from the session storage
  const [state, setState] = useState<PasswordAuthState>(() => {
    let token: string | null | undefined = getToken();
    let user = token ? extractUser(token) : undefined;
    if (user && isTokenExpired(user)) {
      // Remove expired token from local storage
      clearToken();
      token = undefined;
      user = undefined;
    }

    return {
      isAuthenticated: !!token,
      isLoading: false,
      error: undefined,
      user,
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
      const tokenResponse: RawToken = await request({
        url: `${BACKEND_BASE_URL}/oauth/token`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: urlEncodedBody,
      });

      saveToken(tokenResponse.access_token);

      setState({
        isAuthenticated: true,
        isLoading: false,
        error: undefined,
        user: extractUser(tokenResponse.access_token),
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
