import { Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import VectorDataLoad from '../data-layer/VectorDataLoad';
import DataMappingService from '../services/DataMappingService';
import DatasetService from '../services/DatasetService';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import { getNewPath, idToSlug } from '../utils/slugs';

const vectorDataLoad = new VectorDataLoad();
const dataMappingService = new DataMappingService();
const datasetService = new DatasetService();

export const getDatasets = async (req: Request, res: Response) => {
  const data = await datasetService.getDatasets(req.customData);
  res.json(idToSlug(data));
};

export const getDataset = async (req: Request, res: Response) => {
  const oldId = req.params['datasetId']!;
  const data = await datasetService.getDataset(req.customData, oldId);

  if (data.slug !== oldId) {
    const newPath = getNewPath(req.path, oldId, data.slug);
    res.redirect(StatusCodes.MOVED_PERMANENTLY, newPath);
    return;
  }

  res.json(idToSlug(data));
};

export const createDataset = async (req: Request, res: Response) => {
  const input: CreateDatasetInput = req.body;
  const data = await datasetService.createDataset(req.customData, input);
  res.json(idToSlug(data));
};

export const updateDataset = async (req: Request, res: Response) => {
  const input: UpdateDatasetInput = req.body;
  const data = await datasetService.updateDataset(req.customData, req.params['datasetId']!, input);
  res.json(idToSlug(data));
};

export const deleteDataset = async (req: Request, res: Response) => {
  await datasetService.deleteDataset(req.customData, req.params['datasetId']!);
  res.status(StatusCodes.NO_CONTENT).send();
};

export const postSoilData = async (req: Request, res: Response) => {
  const dataMappingConfig = await dataMappingService.parseDataMapping(req.customData, req.params['datasetFileMappingId'] as string);
  const dataset = await datasetService.getDataset(req.customData, req.params['datasetId'] as string);
  await vectorDataLoad.rawRecordToDataModel(req.customData.entityManager, dataMappingConfig, req.body, dataset.id);
  res.status(201).send();
};
