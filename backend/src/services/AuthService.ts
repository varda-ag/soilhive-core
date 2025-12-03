import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { AuthConfig } from "../interfaces/AuthConfig";
import { AuthModes, TokenScopes } from "../types/types";
import ConfigService from "./ConfigService";
import { ErrorResponse } from "../utils/error";
import { StatusCodes } from "http-status-codes";
import { TokenResponse } from "../interfaces/Token";

const TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60; // 24 hours

// Config can only change on server restart because it depends on env vars
let authConfig: AuthConfig | undefined = undefined;

export default class AuthService {
  getToken = (password: string): any => {
    if (!authConfig) {
      authConfig = ConfigService.getAuthConfig();
    }

    if (authConfig.authMode !== AuthModes.PASSWORD) {
      throw new ErrorResponse("Platform is not configured for password authentication", StatusCodes.BAD_REQUEST);
    }

    let payload = {};
    if (process.env.SUPER_ADMIN_PASSWORD_HASH && bcrypt.compareSync(password, process.env.SUPER_ADMIN_PASSWORD_HASH)) {
      payload = {
        sub: TokenScopes.SUPER_ADMIN,
        scope: TokenScopes.SUPER_ADMIN,
      };
    } else if (process.env.DATA_ADMIN_PASSWORD_HASH && bcrypt.compareSync(password, process.env.DATA_ADMIN_PASSWORD_HASH)) {
      payload = {
        sub: TokenScopes.DATA_ADMIN,
        scope: TokenScopes.DATA_ADMIN,
      };
    } else {
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

  resetAuthConfig = () => {
    // Used in tests
    authConfig = undefined;
  }
}
