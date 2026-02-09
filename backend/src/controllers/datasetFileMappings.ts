import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import DatasetFileMappingService from '../services/DatasetFileMappingService';

const datasetFileMappingService = new DatasetFileMappingService();

export const createDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetSlug } = req.params;
  const apiInput = req.body;

  const result = await datasetFileMappingService.upsertMapping(req.customData, datasetSlug!, apiInput);

  res.status(StatusCodes.CREATED).json(result);
};

export const updateDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetSlug, datasetFileMappingId } = req.params;
  const apiInput = req.body;

  const result = await datasetFileMappingService.upsertMapping(req.customData, datasetSlug!, apiInput, datasetFileMappingId);

  res.json(result);
};
