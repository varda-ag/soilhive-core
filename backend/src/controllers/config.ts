import { JsonStorage } from "../entities/JsonStorage";
import { Request, Response } from "express";
import ConfigService from "../services/ConfigService";
import StatusCodes from "http-status-codes";

const configService = new ConfigService();

export const putConfig = async (req: Request, res: Response) => {
  const { repo, id } = getRepoAndId(req);
  const data = await configService.putConfig(repo, id, req.body);
  res.json(data);
};

export const getConfig = async (req: Request, res: Response) => {
  const { repo, id } = getRepoAndId(req);
  const data = await configService.getConfig(repo, id);
  res.json(data);
};

export const deleteConfig = async (req: Request, res: Response) => {
  const { repo, id } = getRepoAndId(req);
  await configService.deleteConfig(repo, id);
  res.sendStatus(StatusCodes.NO_CONTENT);
};

export const exportConfigs = async (req: Request, res: Response) => {
  const { repo } = getRepoAndId(req);
  const data = await configService.exportConfigs(repo);
  res.json(data);
};

const getRepoAndId = (req: Request) => {
  const repo = req.customData.entityManager.getRepository(JsonStorage);
  const id = req.params["configId"]!;
  return { repo, id };
};
