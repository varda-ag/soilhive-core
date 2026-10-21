import { Request } from 'express';
import jwt, { Algorithm, JwtPayload, PublicKey, Secret, VerifyErrors } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { ErrorResponse, getErrorMessage } from '../utils/error';
import StatusCodes from 'http-status-codes';
import { Token } from '../interfaces/Token';
import { AuthModes, TokenScopes } from '../types/enums';
import assert from 'assert';
import { AuthConfig } from '../interfaces/AuthConfig';
import ConfigService from '../services/ConfigService';
import { getPasswordGrantKey } from '../utils/password-grant-key';
import {
  getAdminPluginIds,
  getPluginTokenIssuer,
  getPluginTokenKey,
  PLUGIN_AUDIENCE_PATTERN,
  PLUGIN_TOKEN_TYPE,
  pluginIdFromAudience,
  pluginTokenScope,
} from '../utils/plugin-token-key';

// Global JWKS client based on env var to fetch the public key
let client: any | undefined = undefined;
// Config can only change on server restart because it depends on env vars
let authConfig: AuthConfig | undefined = undefined;

// Function to get the signing key from JWKS based on the JWT header (kid)
const getSigningKeyAsync = async (kid: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!client) {
      assert(process.env.OIDC_JWKS_URL, 'Missing environment variable: OIDC_JWKS_URL');
      client = jwksClient({ jwksUri: process.env.OIDC_JWKS_URL });
    }
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        return reject(err);
      }
      const signingKey = key.getPublicKey();
      resolve(signingKey);
    });
  });
};

type TokenKind = 'internal' | 'plugin' | 'password' | 'idp';

interface VerificationKey {
  kind: TokenKind;
  key: Secret | PublicKey;
  algorithms?: Algorithm[]; // Unset for the IdP, whose algorithm follows its key type
  issuer?: [string, ...string[]];
  audience?: RegExp | [string, ...string[]] | undefined;
}

// One key per kid, never a fallback (see docs/adr/0060)
const getVerificationKey = async (kid: string, authMode: AuthModes): Promise<VerificationKey> => {
  if (kid === TokenScopes.INTERNAL_REQUEST) {
    return { kind: 'internal', key: process.env.SELF_SIGNING_SECRET!, algorithms: ['HS256'] };
  }
  // Before the auth-mode branch: Plugin tokens are accepted in password and OIDC mode alike (docs/adr/0063)
  const pluginTokenKey = getPluginTokenKey();
  if (pluginTokenKey && kid === pluginTokenKey.kid) {
    const issuer = getPluginTokenIssuer();
    if (!issuer) {
      throw new ErrorResponse('Invalid token: Plugin tokens are not configured', StatusCodes.UNAUTHORIZED);
    }
    return { kind: 'plugin', key: pluginTokenKey.publicKey, algorithms: ['ES256'], issuer: [issuer], audience: PLUGIN_AUDIENCE_PATTERN };
  }
  if (authMode === AuthModes.PASSWORD) {
    const passwordGrantKey = getPasswordGrantKey();
    if (kid !== passwordGrantKey.kid) {
      throw new ErrorResponse('Invalid token: unknown kid', StatusCodes.UNAUTHORIZED);
    }
    return { kind: 'password', key: passwordGrantKey.publicKey, algorithms: ['ES256'] };
  }
  try {
    return { kind: 'idp', key: await getSigningKeyAsync(kid) };
  } catch (err) {
    throw new ErrorResponse(`Invalid token: ${getErrorMessage(err)}`, StatusCodes.UNAUTHORIZED);
  }
};

const verifyAsync = (token: string, { key, algorithms, issuer, audience }: VerificationKey): Promise<JwtPayload> => {
  return new Promise((resolve, reject) => {
    const options = { algorithms, issuer, ...(audience ? { audience } : {}) };
    jwt.verify(token, key, options, (err: VerifyErrors | null, decoded: JwtPayload | string | undefined) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded as JwtPayload);
      }
    });
  });
};

export const tokenValidator = async (req: Request, scopes: string[]): Promise<boolean> => {
  if (!authConfig) {
    authConfig = ConfigService.getAuthConfig();
  }

  if (authConfig.authMode === AuthModes.NONE) {
    throw new ErrorResponse('No authentication system has been configured in the platform', StatusCodes.UNAUTHORIZED);
  }

  const tokenString = req.headers['authorization']?.split(' ')[1];
  if (!tokenString) {
    // No token has been provided
    return false;
  }

  // First token decode to get the kid from header
  const decodedHeader = jwt.decode(tokenString, { complete: true });
  if (!decodedHeader || typeof decodedHeader === 'string') {
    throw new ErrorResponse('Invalid token: header decode failure', StatusCodes.UNAUTHORIZED);
  }

  const kid = decodedHeader.header.kid;
  if (!kid) {
    throw new ErrorResponse('Invalid token: no kid', StatusCodes.UNAUTHORIZED);
  }

  const verificationKey = await getVerificationKey(kid, authConfig.authMode);
  let decoded: JwtPayload;
  try {
    decoded = await verifyAsync(tokenString, verificationKey);
  } catch (err: any) {
    const errorMessage = err['name'] === 'TokenExpiredError' ? 'Token has expired' : `Invalid token: ${getErrorMessage(err)}`;
    throw new ErrorResponse(errorMessage, StatusCodes.UNAUTHORIZED);
  }
  if (!decoded?.sub) {
    throw new ErrorResponse('Invalid token: no sub', StatusCodes.UNAUTHORIZED);
  }
  const decodedToken = decoded as Token;
  delete decodedToken.pluginId; // Only the Plugin token branch below sets it, never a claim
  if (verificationKey.kind === 'plugin') {
    applyPluginTokenRules(req, decodedToken, decodedHeader.header.typ);
  }
  // Every refusal happens before the token is attached: on routes whose security also allows no
  // token, the validator drops this handler's error and only authMiddleware's second call refuses
  assertTokenScope(decodedToken, scopes);
  decodedToken.raw = tokenString; // Putting original token string here
  decodedToken.isSuperAdmin = decodedToken.scope?.includes(TokenScopes.SUPER_ADMIN);
  decodedToken.isDataAdmin = decodedToken.scope?.includes(TokenScopes.DATA_ADMIN);
  decodedToken.isInternalRequest = verificationKey.kind !== 'plugin' && decodedToken.scope?.includes(TokenScopes.INTERNAL_REQUEST); // True on bulk load jobs
  req.customData.token = decodedToken;
  return true;
};

/**
 * Refuses a Plugin token on this request unless it is a GET on a route that accepts one: a Plugin
 * token only reads, and `x-plugin-token-denied` marks the reads it may not make (docs/adr/0063).
 * A request with no matched route is refused too.
 */
export const assertPluginTokenAllowed = (req: Request & { openapi?: any }): void => {
  if (req.method !== 'GET') {
    throw new ErrorResponse('A Plugin token only reads', StatusCodes.FORBIDDEN);
  }
  const schema = req.openapi?.schema;
  if (!schema || schema['x-plugin-token-denied']) {
    throw new ErrorResponse('This route does not accept a Plugin token', StatusCodes.FORBIDDEN);
  }
};

// The Subject is `sub` itself (getSubject falls back to it: a Plugin token has no email, gty or
// client_id). No admin rights unless the deployment lists the plugin, checked on every call.
const applyPluginTokenRules = (req: Request & { openapi?: any }, token: Token, typ: string | undefined): void => {
  const pluginId = pluginIdFromAudience(token.aud);
  if (typ !== PLUGIN_TOKEN_TYPE || !pluginId) {
    throw new ErrorResponse('Invalid token: not a Plugin token', StatusCodes.UNAUTHORIZED);
  }
  assertPluginTokenAllowed(req);
  delete token.email;
  delete token.gty;
  delete token.client_id;
  token.scope = getAdminPluginIds().has(pluginId) ? pluginTokenScope(token.scope) : '';
  token.pluginId = pluginId;
};

const assertTokenScope = (token: Token, scopes: string[]) => {
  if (scopes.length === 0) {
    return;
  }
  for (const s of scopes) {
    if (token.scope.includes(s)) {
      return;
    }
  }
  throw new ErrorResponse(`Token missing required scope: ${scopes}`, StatusCodes.FORBIDDEN);
};
