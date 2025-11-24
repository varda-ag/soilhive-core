import { Request, Response } from "express";
import AuthService from "../services/AuthService";
import ConfigService from "../services/ConfigService";

const authService = new AuthService();

export const getToken = async (req: Request, res: Response) => {
  const password = req.body.password;
  const data = await authService.getToken(password);
  const response = authService.getTokenResponse(data);
  res.json(response);
};

export const getConfig = (req: Request, res: Response): void => {
  const config = ConfigService.getAuthConfig()
  res.json(config)
}
