import { ErrorResponse } from "../utils/error";
import { JsonStorage } from "../entities/JsonStorage";
import { Request, Response } from "express";

export const putConfig = async (req: Request, res: Response) => {
  res.json({ message: "PUT config not implemented yet" });
};

export const getConfig = async (req: Request, res: Response) => {
  const repo = req.customData.entityManager.getRepository(JsonStorage);
  const data = await repo.findOneBy({ id: req.params['id']! });
  if (!data) {
    throw new ErrorResponse("Configuration not found", 404);
  }
  res.json(data);
};

export const deleteConfig = async (req: Request, res: Response) => {
  res.json({ message: "DELETE config not implemented yet" });
};
