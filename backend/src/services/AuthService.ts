import jwt from "jsonwebtoken";
import { AuthConfig } from "../interfaces/AuthConfig";
import { AuthModes, TokenScopes } from "../types/types";
import ConfigService from "./ConfigService";
import { ErrorResponse } from "../utils/error";
import { StatusCodes } from "http-status-codes";
import { TokenResponse } from "src/interfaces/Token";

const TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours

// Config can only change on server restart because it depends on env vars
let authConfig: AuthConfig | undefined = undefined;

export default class AuthService {
  getToken = (password: string): any => {
    if (!authConfig) {
      authConfig = ConfigService.getAuthConfig();
    }

    if (authConfig.authMode !== AuthModes.PASSWORD) {
      new ErrorResponse("Platform is not configured for password authentication", StatusCodes.BAD_REQUEST);
    }

    let payload = {};
    switch (password) {
      case process.env.SUPER_ADMIN_PASSWORD:
        payload = {
          sub: TokenScopes.SUPER_ADMIN,
          scope: TokenScopes.SUPER_ADMIN,
        };
        break;
      case process.env.DATA_ADMIN_PASSWORD:
        payload = {
          sub: TokenScopes.DATA_ADMIN,
          scope: TokenScopes.DATA_ADMIN,
        };
        break;
      default:
        throw new ErrorResponse("Invalid password", StatusCodes.UNAUTHORIZED);
    }

    return jwt.sign(payload, process.env.SELF_SIGNING_SECRET!, { expiresIn: TOKEN_EXPIRATION_SECONDS, algorithm: "HS256", header: { alg: "HS256", kid: "kid" } });
  };

  getTokenResponse = (token: string): TokenResponse => {
    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: TOKEN_EXPIRATION_SECONDS,
    };
  };
}
