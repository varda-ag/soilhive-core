import { Request, Response } from 'express';
import DataMappingService from '../services/DataMappingService';
import StatusCodes from 'http-status-codes';
import { DataMapping } from '../interfaces/DataMapping';

type PostMappingResponse = Pick<DataMapping, 'id' | 'data_mapping'>;
const dataMappingService = new DataMappingService();

export const createDataMapping = async (req: Request, res: Response) => {
  const apiInput = req.body;

  const dataMappingEntity = await dataMappingService.postDataMapping(req.customData, apiInput);
  const dataMapping = {
    id: dataMappingEntity.id,
    data_mapping: dataMappingEntity.data_mapping,
  } as PostMappingResponse;

  res.status(StatusCodes.CREATED).json(dataMapping);
};

export const getDataMapping = async (req: Request, res: Response) => {
  const id = req.params['mappingId']!;

  const dataMappingEntity = await dataMappingService.getDataMapping(req.customData, id);
  const dataMapping = {
    id: dataMappingEntity.id,
    data_mapping: dataMappingEntity.data_mapping,
  } as PostMappingResponse;

  res.json(dataMapping);
};

export const deleteDataMapping = async (req: Request, res: Response) => {
  const id = req.params['mappingId']!;

  await dataMappingService.deleteDataMapping(req.customData, id);

  res.status(StatusCodes.NO_CONTENT).send();
};
