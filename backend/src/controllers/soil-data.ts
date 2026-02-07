import { Request, Response } from 'express';
import SoilDataStorage from '../data-layer/SoilDataStorage';
import { DataFilter } from '../interfaces/DatasetFilter';
import FilterService from '../services/FilterService';
import DatasetService from '../services/DatasetService';
import DataMappingService from '../services/DataMappingService';
import VectorDataLoad from '../data-layer/VectorDataLoad';

const soilDataStorage = new SoilDataStorage();
const vectorDataLoad = new VectorDataLoad();
const filterService = new FilterService();
const dataMappingService = new DataMappingService();
const datasetService = new DatasetService();

export const getSoilData = async (req: Request, res: Response) => {
  const filter = await getDataFilter(req);
  const data = await soilDataStorage.getSoilData(
    req.customData.entityManager,
    filter,
    req.query['datasets'] as string[],
    parseInt(req.query['limit'] as string),
    req.query['cursor'] as string,
    req.query['sort'] as string,
  );
  res.json(data);
};

const getDataFilter = async (req: Request): Promise<DataFilter> => {
  if (!req.query['filterId']) {
    return { geometries: [], parameters: {} };
  }
  const filterId = req.query['filterId'] as string;
  const storedFilter = await filterService.getFilterById(req.customData, filterId);
  return storedFilter!.filter;
};

export const postSoilData = async (req: Request, res: Response) => {
  const dataMappingConfig = await dataMappingService.parseDataMapping(req.customData, req.query['dataMappingId'] as string);
  const dataset = await datasetService.getDataset(req.customData, req.query['datasetId'] as string);

  await vectorDataLoad.rawRecordToDataModel(req.customData.entityManager, dataMappingConfig, req.body, dataset.id);
  res.status(201).send();
};
