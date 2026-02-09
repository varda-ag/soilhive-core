import { Request, Response } from 'express';
import DataMappingService from '../services/DataMappingService';
import StatusCodes from 'http-status-codes';

const dataMappingService = new DataMappingService();

export const createDataMapping = async (req: Request, res: Response) => {
  const apiInput = req.body;

  const dataMapping = await dataMappingService.postDataMapping(req.customData, apiInput);

  res.json(dataMapping);
};

export const getDataMapping = async (req: Request, res: Response) => {
  const id = req.params['mappingId']!;

  const dataMapping = await dataMappingService.getDataMapping(req.customData, id);

  res.json(dataMapping);
};

export const deleteDataMapping = async (req: Request, res: Response) => {
  const id = req.params['mappingId']!;

  await dataMappingService.deleteDataMapping(req.customData, id);

  res.status(StatusCodes.NO_CONTENT).send();
};
