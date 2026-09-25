import { JsonStorage } from '../entities/JsonStorage';
import { Request, Response } from 'express';
import ConfigService from '../services/ConfigService';
import DataRequestService from '../services/DataRequestService';
import { PLUGIN_CONFIG_ID_PATTERN } from '../constants/constants';
import StatusCodes from 'http-status-codes';

const configService = new ConfigService();
const dataRequestService = new DataRequestService();

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
  // Only a plugin config item can have Data Requests attached (docs/adr/0041). Run here rather than
  // in ConfigService, whose import graph would otherwise close a load-order cycle through JobService.
  if (PLUGIN_CONFIG_ID_PATTERN.test(id)) {
    await dataRequestService.deleteAttachedDataRequests(req.customData, id);
  }
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
