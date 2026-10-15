import bcrypt from 'bcrypt';
import { AuthConfig } from '../interfaces/AuthConfig';
import { AuthModes, TOKEN_ISSUER, TokenScopes } from '../types/enums';
import ConfigService from './ConfigService';
import { ErrorResponse } from '../utils/error';
import { PublicJwk, getPasswordGrantKey, signPasswordGrantToken } from '../utils/password-grant-key';
import { StatusCodes } from 'http-status-codes';
import { TokenResponse } from '../interfaces/Token';
import assert from 'assert';

const TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours

// Config can only change on server restart because it depends on env vars
let authConfig: AuthConfig | undefined = undefined;

export default class AuthService {
  getToken = (password: string): any => {
    if (!this.isPasswordMode()) {
      throw new ErrorResponse('Platform is not configured for password authentication', StatusCodes.BAD_REQUEST);
    }

    const scopes: TokenScopes[] = [];
    if (process.env.SUPER_ADMIN_PASSWORD_HASH && bcrypt.compareSync(password, process.env.SUPER_ADMIN_PASSWORD_HASH)) {
      scopes.push(TokenScopes.SUPER_ADMIN);
      scopes.push(TokenScopes.DATA_ADMIN);
    } else if (process.env.DATA_ADMIN_PASSWORD_HASH && bcrypt.compareSync(password, process.env.DATA_ADMIN_PASSWORD_HASH)) {
      scopes.push(TokenScopes.DATA_ADMIN);
    } else {
      throw new ErrorResponse('Invalid password', StatusCodes.UNAUTHORIZED);
    }

    return signPasswordGrantToken(this.getTokenPayload(scopes), TOKEN_EXPIRATION_SECONDS);
  };

  getJwks = (): { keys: PublicJwk[] } => {
    if (!this.isPasswordMode()) {
      throw new ErrorResponse('JWKS is only available in password authentication mode', StatusCodes.NOT_FOUND);
    }
    return { keys: [getPasswordGrantKey().jwk] };
  };

  getTokenResponse = (token: string): TokenResponse => {
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: TOKEN_EXPIRATION_SECONDS,
    };
  };

  resetAuthConfig = () => {
    // Used in tests
    authConfig = undefined;
  };

  private isPasswordMode = (): boolean => {
    if (!authConfig) {
      authConfig = ConfigService.getAuthConfig();
    }
    return authConfig.authMode === AuthModes.PASSWORD;
  };

  private getTokenPayload = (scopes: TokenScopes[]) => {
    assert(scopes.length > 0, 'At least one scope must be provided');
    const scope = scopes[0]!;
    const parts = scope.split('-');
    const given_name = parts[0];
    const family_name = parts[1] || parts[0];
    const name = `${given_name} ${family_name}`;
    const email = `${scope}@localhost`;
    return {
      scope: scopes.join(' '),
      sub: scope,
      iss: TOKEN_ISSUER,
      email_verified: true,
      given_name,
      family_name,
      name,
      email,
    };
  };
}
