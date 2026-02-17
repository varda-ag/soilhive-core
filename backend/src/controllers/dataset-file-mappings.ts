import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import DatasetFileMappingService from '../services/DatasetFileMappingService';

const datasetFileMappingService = new DatasetFileMappingService();

export const createDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const apiInput = req.body;

  const datasetFileMapping = await datasetFileMappingService.createMapping(req.customData, datasetId!, apiInput);
  const response = DatasetFileMappingService.mapResultToResponse(datasetFileMapping);

  res.status(StatusCodes.CREATED).json(response);
};

export const updateDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetId, datasetFileMappingId } = req.params;
  const apiInput = req.body;

  const datasetFileMapping = await datasetFileMappingService.updateMapping(req.customData, datasetId!, datasetFileMappingId!, apiInput);
  const response = DatasetFileMappingService.mapResultToResponse(datasetFileMapping);

  res.json(response);
};

export const getDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetFileMappingId } = req.params;

  const datasetFileMapping = await datasetFileMappingService.getDatasetFileMapping(req.customData, datasetFileMappingId!);
  const response = DatasetFileMappingService.mapResultToResponse(datasetFileMapping);

  res.json(response);
};

export const getDatasetFileMappings = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const { fileId } = req.query;

  const datasetFileMappings = await datasetFileMappingService.getMappings(req.customData, datasetId!, fileId as string | undefined);
  const response = datasetFileMappings.map(mapping => DatasetFileMappingService.mapResultToResponse(mapping));

  res.json(response);
};
