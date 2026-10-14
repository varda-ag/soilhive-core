import { Request, Response } from 'express';
import AuthService from '../services/AuthService';
import ConfigService from '../services/ConfigService';

const authService = new AuthService();

const JWKS_MAX_AGE_SECONDS = 300;

export const getToken = async (req: Request, res: Response) => {
  const password = req.body.password;
  const data = await authService.getToken(password);
  const response = authService.getTokenResponse(data);
  res.json(response);
};

export const getJwks = (req: Request, res: Response): void => {
  const jwks = authService.getJwks();
  res.set('Cache-Control', `public, max-age=${JWKS_MAX_AGE_SECONDS}`);
  res.json(jwks);
};

export const getConfig = (req: Request, res: Response): void => {
  const config = ConfigService.getAuthConfig();
  res.json(config);
};
