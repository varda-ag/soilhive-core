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

interface VerificationKey {
  key: Secret | PublicKey;
  algorithms?: Algorithm[]; // Unset for the IdP, whose algorithm follows its key type
}

// One key per kid, never a fallback (see docs/adr/0060)
const getVerificationKey = async (kid: string, authMode: AuthModes): Promise<VerificationKey> => {
  if (kid === TokenScopes.INTERNAL_REQUEST) {
    return { key: process.env.SELF_SIGNING_SECRET!, algorithms: ['HS256'] };
  }
  if (authMode === AuthModes.PASSWORD) {
    const passwordGrantKey = getPasswordGrantKey();
    if (kid !== passwordGrantKey.kid) {
      throw new ErrorResponse('Invalid token: unknown kid', StatusCodes.UNAUTHORIZED);
    }
    return { key: passwordGrantKey.publicKey, algorithms: ['ES256'] };
  }
  try {
    return { key: await getSigningKeyAsync(kid) };
  } catch (err) {
    throw new ErrorResponse(`Invalid token: ${getErrorMessage(err)}`, StatusCodes.UNAUTHORIZED);
  }
};

const verifyAsync = (token: string, { key, algorithms }: VerificationKey): Promise<JwtPayload> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, key, { algorithms }, (err: VerifyErrors | null, decoded: JwtPayload | string | undefined) => {
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
  assertTokenScope(decodedToken, scopes);
  req.customData.token = decodedToken;
  req.customData.token.raw = tokenString; // Putting original token string here
  req.customData.token.isSuperAdmin = decodedToken.scope?.includes(TokenScopes.SUPER_ADMIN);
  req.customData.token.isDataAdmin = decodedToken.scope?.includes(TokenScopes.DATA_ADMIN);
  req.customData.token.isInternalRequest = decodedToken.scope?.includes(TokenScopes.INTERNAL_REQUEST); // True on bulk load jobs
  return true;
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
