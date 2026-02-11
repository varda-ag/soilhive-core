import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import DatasetFileMappingService from '../services/DatasetFileMappingService';

const datasetFileMappingService = new DatasetFileMappingService();

export const createDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const apiInput = req.body;

  const result = await datasetFileMappingService.createMapping(req.customData, datasetId!, apiInput);

  res.status(StatusCodes.CREATED).json(result);
};

export const updateDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetId, datasetFileMappingId } = req.params;
  const apiInput = req.body;

  const result = await datasetFileMappingService.updateMapping(req.customData, datasetId!, datasetFileMappingId!, apiInput);

  res.json(result);
};

export const getDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetFileMappingId } = req.params;

  const result = await datasetFileMappingService.getDatasetFileMapping(req.customData, datasetFileMappingId!);

  res.json(result);
};

export const getDatasetFileMappings = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const { fileId } = req.query;

  const result = await datasetFileMappingService.getMappings(req.customData, datasetId!, fileId as string | undefined);

  res.json(result);
};
