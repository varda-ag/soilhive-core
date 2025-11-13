import type { AuthConfig } from './AuthConfig'
import authConfig from './authConfig.json'
import token from './token.json'
import type { Token } from './Token'

export function fetchAuthConfig(): Promise<AuthConfig> {
    return Promise.resolve(authConfig)
}

export function loginWithPassword(password?: string): Promise<Token> {
    if(password === 'password') {
        return Promise.resolve(token)
    }
    else{
        throw Error("Invalid password")
    }
}