import { Request } from "express";
import jwt, { JwtPayload, PublicKey, Secret, VerifyErrors } from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { ErrorResponse } from "../utils/error";
import StatusCodes from "http-status-codes";
import { Token } from "../interfaces/Token";
import { AuthModes, TokenScopes } from "../types/types";
import assert from "assert";
import { AuthConfig } from "../interfaces/AuthConfig";
import ConfigService from "../services/ConfigService";

// Global JWKS client based on env var to fetch the public key
let client: any | undefined = undefined;
// Config can only change on server restart because it depends on env vars
let authConfig: AuthConfig | undefined = undefined;

// Function to get the signing key from JWKS based on the JWT header (kid)
const getSigningKeyAsync = async (kid: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!client) {
      assert(process.env.OIDC_JWKS_URL, "Missing environment variable: OIDC_JWKS_URL");
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

const verifyAsync = (token: string, secretOrPublicKey: Secret | PublicKey): Promise<JwtPayload> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, secretOrPublicKey, (err: VerifyErrors | null, decoded: JwtPayload | string | undefined) => {
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
    throw new ErrorResponse("No authentication system has been configured in the platform", StatusCodes.UNAUTHORIZED);
  }

  const tokenString = req.headers["authorization"]?.split(" ")[1];
  if (!tokenString) {
    // No token has been provided
    return false;
  }

  // First token decode to get the kid from header
  const decodedHeader = jwt.decode(tokenString, { complete: true });
  if (!decodedHeader || typeof decodedHeader === "string") {
    throw new ErrorResponse("Invalid token (header decode failure)", StatusCodes.UNAUTHORIZED);
  }
  const kid = decodedHeader.header.kid;
  if (!kid) {
    throw new ErrorResponse("Invalid token (no kid)", StatusCodes.UNAUTHORIZED);
  }

  try {
    const publicKey = authConfig.authMode === AuthModes.OIDC ? await getSigningKeyAsync(kid) : process.env.SELF_SIGNING_SECRET!;
    const decoded = await verifyAsync(tokenString, publicKey);
    if (!decoded) {
      new ErrorResponse("Invalid token (decode failure)", StatusCodes.UNAUTHORIZED);
    }
    if (!decoded.sub) {
      throw new ErrorResponse("Invalid token (no sub)", StatusCodes.UNAUTHORIZED);
    }
    const decodedToken = decoded as Token;
    for (const s of scopes) {
      if (!decodedToken.scope || !decodedToken.scope.includes(s)) {
        throw new ErrorResponse(`Token missing required scope: ${s}`, StatusCodes.FORBIDDEN);
      }
    }
    req.customData.token = decodedToken;
    req.customData.token.raw = tokenString; // Putting original token string here
    req.customData.token.isSuperAdmin = function () {
      return this.scope?.includes(TokenScopes.SUPER_ADMIN);
    };
    req.customData.token.isDataAdmin = function () {
      return this.scope?.includes(TokenScopes.DATA_ADMIN);
    };
    return true;
  } catch (err: any) {
    if (err instanceof ErrorResponse) {
      throw err;
    }
    const errorMessage = err["name"] === "TokenExpiredError" ? "Token has expired" : `Invalid token: ${err.message}`;
    new ErrorResponse(errorMessage, StatusCodes.UNAUTHORIZED);
  }
  return false;
};
