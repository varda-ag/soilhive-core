import { Request, Response } from "express";
import AuthService from "../services/AuthService";

const authService = new AuthService();

export const getToken = async (req: Request, res: Response) => {
  const data = await authService.getToken(req.body);
  res.json(data);
};
