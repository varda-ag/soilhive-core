import { useState } from "react";
import type { Token } from "./Token";
import { loginWithPassword } from "./authApi";

const TOKEN_STORAGE_KKEY = 'soilhive_token'

interface PasswordAuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    error?: Error;
    token?: Token | null;
}

export function usePasswordAuth() {

    // try and load token from the session storage
    const [state, setState] = useState<PasswordAuthState>(() => {
        const token = sessionStorage.getItem(TOKEN_STORAGE_KKEY);

        return {
            isAuthenticated: !!token,
            isLoading: false,
            error: undefined,
            token: token ? JSON.parse(token) : null,
        };
    });

    const login = async (password?: string) => {
        setState(prev => ({ ...prev, isLoading: true, error: undefined }));

        try {
            const token = await loginWithPassword(password);

            sessionStorage.setItem(TOKEN_STORAGE_KKEY, JSON.stringify(token))

            setState({
                isAuthenticated: true,
                isLoading: false,
                error: undefined,
                token: token,
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
        sessionStorage.removeItem(TOKEN_STORAGE_KKEY)

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