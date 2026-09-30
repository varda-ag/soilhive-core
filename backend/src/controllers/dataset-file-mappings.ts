import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import DatasetFileMappingService from '../services/DatasetFileMappingService';
import DatasetService from '../services/DatasetService';

const datasetFileMappingService = new DatasetFileMappingService();
const datasetService = new DatasetService();

export const createDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const apiInput = req.body;

  await datasetService.assertEditable(req.customData, datasetId! as string);
  const result = await datasetFileMappingService.createMapping(req.customData, datasetId! as string, apiInput);
  const response = await DatasetFileMappingService.toResponse(req.customData, result);

  res.status(StatusCodes.CREATED).json(response);
};

export const updateDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetId, datasetFileMappingId } = req.params;
  const apiInput = req.body;

  await datasetService.assertEditable(req.customData, datasetId! as string);
  const result = await datasetFileMappingService.updateMapping(
    req.customData,
    datasetId! as string,
    datasetFileMappingId! as string,
    apiInput,
  );
  const response = await DatasetFileMappingService.toResponse(req.customData, result);

  res.json(response);
};

export const getDatasetFileMapping = async (req: Request, res: Response) => {
  const { datasetFileMappingId } = req.params;

  const result = await datasetFileMappingService.getDatasetFileMapping(req.customData, datasetFileMappingId! as string);
  const response = await DatasetFileMappingService.toResponse(req.customData, result);

  res.json(response);
};

export const getDatasetFileMappings = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const { fileId } = req.query;

  const result = await datasetFileMappingService.getMappings(req.customData, datasetId! as string, fileId as string | undefined);
  const response = await DatasetFileMappingService.toResponse(req.customData, result);

  res.json(response);
};

export const deleteDatasetFileMappingByFileId = async (req: Request, res: Response) => {
  const { datasetId } = req.params;
  const { fileId } = req.query;

  await datasetService.assertEditable(req.customData, datasetId! as string);
  await datasetFileMappingService.deleteDataMappingByFileId(req.customData, datasetId! as string, fileId as string);

  res.sendStatus(StatusCodes.NO_CONTENT);
};
