import type { AuthConfig } from './AuthConfig'
import authConfig from './authConfig.json'

export function fetchAuthConfig(): Promise<AuthConfig> {
    return Promise.resolve(authConfig)
}