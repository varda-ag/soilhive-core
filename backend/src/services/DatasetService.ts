import { StatusCodes } from 'http-status-codes';
import { RequestData } from '../interfaces/RequestData';
import { ErrorResponse } from '../utils/error';
import DatasetEntity from '../entities/Dataset';
import { CreateDatasetInput, UpdateDatasetInput } from '../types/DatasetInput';
import { getEntity } from '../utils/slugs';
import { EntityType, IngestionStatus } from '../types/data';
import { epsgList } from '../assets/epsg';
import { Capability } from '../types/enums';
import { Entitlements } from '../types/Entitlements';
import VectorDataLoad from '../data-layer/VectorDataLoad';
import DataMappingService from './DataMappingService';
import DatasetFileMappingService from './DatasetFileMappingService';

const vdl = new VectorDataLoad();
const dmService = new DataMappingService();
const dfmService = new DatasetFileMappingService();

export default class DatasetService {
  getDatasets = async (requestData: RequestData): Promise<DatasetEntity[]> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const entities = await repo.find();
    entities.map(e => this.decorateWithCapabilities(e, requestData.entitlements));
    return entities;
  };

  getDataset = async (requestData: RequestData, slug: string): Promise<DatasetEntity> => {
    const entity = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);
    this.decorateWithCapabilities(entity, requestData.entitlements);
    return entity;
  };

  createDataset = async (requestData: RequestData, data: CreateDatasetInput): Promise<DatasetEntity> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);

    const { sub } = requestData.token ?? {};
    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    const dataset = repo.create({
      ...data,
      created_by: String(sub),
      updated_by: String(sub),
    });

    try {
      const saved = await repo.save(dataset);
      const reloaded = await repo.findOneBy({ id: saved.id });
      this.decorateWithCapabilities(reloaded!, requestData.entitlements);
      return reloaded!;
    } catch (error: any) {
      if (error.code === '23505') {
        // unique violation
        throw new ErrorResponse(`Dataset with name '${data.name}' already exists`, StatusCodes.CONFLICT);
      }
      throw error;
    }
  };

  updateDataset = async (requestData: RequestData, slug: string, data: UpdateDatasetInput): Promise<DatasetEntity> => {
    const repo = requestData.entityManager.getRepository(DatasetEntity);
    const { sub } = requestData.token ?? {};

    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }

    const dataset: DatasetEntity = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);

    repo.merge(dataset, {
      ...data,
      updated_by: String(sub),
      updated_at: new Date(),
    });

    const saved = await repo.save(dataset);
    const reloaded = await repo.findOneBy({ id: saved.id });
    this.decorateWithCapabilities(reloaded!, requestData.entitlements);
    return reloaded!;
  };

  deleteDataset = async (requestData: RequestData, slug: string): Promise<void> => {
    const dataset = await getEntity(requestData, DatasetEntity, EntityType.DATASET, slug);
    const { sub } = requestData.token ?? {};

    if (!sub) {
      throw new ErrorResponse('Token subject is missing', StatusCodes.UNAUTHORIZED);
    }
    dataset.status = IngestionStatus.ARCHIVED;
    dataset.updated_by = String(sub);
    await dataset.save();
    await requestData.entityManager.getRepository(DatasetEntity).softRemove(dataset);
  };

  getEpsgCodes = (): number[] => {
    return epsgList;
  };

  decorateWithCapabilities = (dataset: DatasetEntity, entitlements: Entitlements) => {
    // For private datasets, capabilities are determined by entitlements.
    // For public datasets, all capabilities are granted.
    dataset.capabilities = dataset.visibility === 'private' ? entitlements[dataset.slug] || [] : [Capability.PREVIEW, Capability.DOWNLOAD];
  };

  async getSoilData(requestData: RequestData, datasetFileMappingId: string, limit: number, cursor?: string, sort?: string) {
    const datasetFileMapping = await dfmService.getDatasetFileMapping(requestData, datasetFileMappingId);
    const dataMappingConfig = await dmService.parseDataMapping(requestData, datasetFileMapping.data_mapping_id!);
    const results = await vdl.getDataPreview(
      requestData.entityManager,
      dataMappingConfig,
      datasetFileMapping.file_id!,
      limit,
      cursor,
      sort,
    );
    return results;
  }
}
