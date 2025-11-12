import { Request } from "express";
import jwt, { JwtPayload, PublicKey, Secret, VerifyErrors } from "jsonwebtoken";
import { ErrorResponse } from "src/utils/error";
import StatusCodes from "http-status-codes";
import { Token } from "../interfaces/Token";
import { TokenScopes } from "../types/types";

// Global JWKS client based on env var to fetch the public key
let client: any | undefined = undefined;

// Function to get the signing key from JWKS based on the JWT header (kid)
const getSigningKeyAsync = async (kid: string): Promise<string> => {
  return new Promise((resolve, reject) => {
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

export const tokenValidator = async (req: Request): Promise<boolean> => {
  const tokenString = req.headers["authorization"]?.split(" ")[1];
  if (!tokenString) {
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
    const publicKey = await getSigningKeyAsync(kid);
    const decoded = await verifyAsync(tokenString, publicKey);
    if (!decoded) {
      new ErrorResponse("Invalid token (decode failure)", StatusCodes.UNAUTHORIZED);
    }
    if (!decoded.sub) {
      throw new ErrorResponse("Invalid token (no sub)", StatusCodes.UNAUTHORIZED);
    }
    req.customData.token = decoded as Token;
    req.customData.token.raw = tokenString; // Putting original token string here
    req.customData.token.isPlatformAdmin = function () {
      return this.scope?.includes(TokenScopes.PLATFORM_ADMIN);
    };
    req.customData.token.isDataAdmin = function () {
      return this.scope?.includes(TokenScopes.DATA_ADMIN);
    };
    return true;
  } catch (err: any) {
    const errorMessage = err["name"] === "TokenExpiredError" ? "Token has expired" : `Invalid token: ${err.message}`;
    new ErrorResponse(errorMessage, StatusCodes.UNAUTHORIZED);
  }
  return false;
};
