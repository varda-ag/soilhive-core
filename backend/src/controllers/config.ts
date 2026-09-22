import { JsonStorage } from '../entities/JsonStorage';
import { Request, Response } from 'express';
import ConfigService from '../services/ConfigService';
import StatusCodes from 'http-status-codes';

const configService = new ConfigService();

export const putConfig = async (req: Request, res: Response) => {
  const id = req.params['configId']! as string;
  const data = await configService.putConfig(req.customData, id, req.body);
  res.json(data);
};

export const getConfig = async (req: Request, res: Response) => {
  const id = req.params['configId']! as string;
  const data = await configService.getConfig(req.customData, id);
  res.json(data);
};

export const deleteConfig = async (req: Request, res: Response) => {
  const id = req.params['configId']! as string;
  await configService.deleteConfig(req.customData, id);
  res.sendStatus(StatusCodes.NO_CONTENT);
};

export const getConfigs = async (req: Request, res: Response) => {
  const ids = req.query['ids'] as string[];
  const data = await configService.getConfigs(req.customData, ids);
  res.json(data);
};

export const exportConfigs = async (req: Request, res: Response) => {
  const repo = req.customData.entityManager.getRepository(JsonStorage);
  const data = await configService.exportConfigs(repo);
  res.json(data);
};
