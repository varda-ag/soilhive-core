import token from './token.json'
import type { Token } from './Token'

export function loginWithPassword(password?: string): Promise<Token> {
    if(password === 'password') {
        return Promise.resolve(token)
    }
    else{
        throw Error("Invalid password")
    }
}