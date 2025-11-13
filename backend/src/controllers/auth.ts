import { Request, Response } from "express";
import ConfigService from "../services/ConfigService";

const configService = new ConfigService();

export const getToken = async (req: Request, res: Response) => {
  const data = await authService.getToken(req.body);
  res.json(data);
};
