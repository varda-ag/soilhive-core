import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { Config } from './config.js';

// Plugin tokens are minted by the SoilHive core for one plugin and one signed-in user, and live a
// few minutes. The host sends one with every call it makes for the plugin; an anonymous visitor's
// calls carry none.
export interface PluginUser {
  subject: string; // the user's Subject: what the core grants Entitlements to
  scopes: string[]; // super-admin and data-admin only, and only if the core's deployment lists this plugin
  token: string; // sent back to the core to read its data as the user
}

export interface VerifierOptions {
  jwksCooldownMs?: number; // how soon an unknown kid may refetch the keys (jose's default: 30 s)
}

class Unauthorized extends Error {}

// jose's codes for the core's keys being out of reach: no answer in time, a non-200, or no key set
const KEYS_UNAVAILABLE = ['ERR_JOSE_GENERIC', 'ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID'];

const bearerToken = (req: Request): string | undefined => {
  const header = req.get('Authorization');
  if (header === undefined) {
    return undefined;
  }
  const match = /^Bearer (\S+)$/i.exec(header);
  if (!match) {
    throw new Unauthorized();
  }
  return match[1];
};

export const createPluginTokenVerifier = (config: Config, options: VerifierOptions = {}) => {
  // Fetched once and cached, then again when a token names a kid it does not hold (a rotated key)
  const keys = createRemoteJWKSet(new URL(`${config.coreInternalUrl}/.well-known/plugin-jwks.json`), {
    cooldownDuration: options.jwksCooldownMs,
  });

  const verify = async (token: string): Promise<PluginUser> => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        algorithms: ['ES256'],
        typ: 'plugin+jwt',
        issuer: config.coreUrl,
        audience: `plugin:${config.pluginId}`,
        clockTolerance: 60,
        requiredClaims: ['exp', 'sub'],
      });
      const scopes = typeof payload['scope'] === 'string' ? payload['scope'].split(' ').filter(Boolean) : [];
      return { subject: payload.sub!, scopes, token };
    } catch (error) {
      // The core's keys out of reach is our problem, not the token's: a 401 would only make the
      // host mint another one
      if (error instanceof errors.JOSEError && !KEYS_UNAVAILABLE.includes(error.code)) {
        throw new Unauthorized();
      }
      throw error;
    }
  };

  const check =
    (required: boolean): RequestHandler =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = bearerToken(req);
        if (token === undefined) {
          if (required) {
            throw new Unauthorized();
          }
          return next();
        }
        // A token that is present must be valid, even where none is needed: answering it as an
        // anonymous call would hide the 401 that makes the host renew it
        res.locals['user'] = await verify(token);
        next();
      } catch (error) {
        if (error instanceof Unauthorized) {
          res.set('WWW-Authenticate', 'Bearer').status(401).json({ detail: 'A valid Plugin token is required' });
          return;
        }
        res.status(503).json({ detail: 'The SoilHive core cannot be reached to check the token' });
      }
    };

  return { optionalPluginToken: check(false), requirePluginToken: check(true) };
};

export const pluginUser = (res: Response): PluginUser | undefined => res.locals['user'];
