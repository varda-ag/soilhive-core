import { useState } from "react";
import type { Token } from "./Token";
import { useRequest } from "../api-client";
import { jwtDecode, type JwtPayload } from "jwt-decode";
import { clearToken, saveToken } from "./tokenStore";

const TOKEN_STORAGE_KEY = 'soilhive_token'

interface PasswordAuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    error?: Error;
    token?: Token | null;
}

interface RawToken {
    access_token: string,
    expires_in: number,
    token_type: string
}


function adaptToken(rawToken: RawToken): Token {

    const decodedToken: JwtPayload = jwtDecode(rawToken.access_token)

    const token: Token = {
        scope: (decodedToken as any).scope,
        expires_at: decodedToken.exp,
        access_token: rawToken.access_token,
        profile: {
            iat: decodedToken.iat,
            sub: decodedToken.sub,
            name: decodedToken.sub
        }
    }

    return token
}

export function usePasswordAuth() {

    const { request } = useRequest()

    // try and load token from the session storage
    const [state, setState] = useState<PasswordAuthState>(() => {
        const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);

        let parsedToken = null

        if(token) {
            parsedToken = JSON.parse(token)
            saveToken(parsedToken.access_token)
        }

        return {
            isAuthenticated: !!token,
            isLoading: false,
            error: undefined,
            token: parsedToken ? adaptToken(parsedToken) : null,
        };
    });

    const login = async (password?: string) => {
        setState(prev => ({ ...prev, isLoading: true, error: undefined }));

        const body = {
            grant_type: 'password',
            username: '_',
            password: password || ''
        };

        const urlEncodedBody = new URLSearchParams(body).toString();

        try {
            const token = await request({
                url: 'http://localhost:4001/oauth/token',
                method: 'POST',
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: urlEncodedBody
            })

            sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token))
            saveToken(token.access_token)

            setState({
                isAuthenticated: true,
                isLoading: false,
                error: undefined,
                token: adaptToken(token),
            });
        } catch (error) {
            setState({
                isAuthenticated: false,
                isLoading: false,
                error: error as Error,
                token: null,
            });
            throw error;
        }
    }

    const logout = () => {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY)
        clearToken()

        setState({
            isAuthenticated: false,
            isLoading: false,
            error: undefined,
            token: null,
        });
    }

    return {
        ...state,
        login,
        logout
    }
}