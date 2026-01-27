import { getEntityManager } from '../../src/utils/data-source';
import { DATA_PREVIEW_SIZE } from '../../src/constants/constants';
import { addSyntheticIngestionData, syntheticIngestionDataOptions } from '../../src/utils/mock';
import VectorDataLoad from '../../src/data-layer/VectorDataLoad';
import DataMappingService from '../../src/services/DataMappingService';
import { RequestData } from '../../src/interfaces/RequestData';
import FeatureEntity from '../../src/entities/Feature';
import LayerEntity from '../../src/entities/Layer';
import DatasetLayerEntity from '../../src/entities/DatasetLayer';
import ObservationEntity from '../../src/entities/Observation';

describe('VectorDataLoad class', () => {
  it('Data preview should be generated based on parsed data mapping', async () => {
    const { file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const vdl = new VectorDataLoad();
    const entityManager = await getEntityManager();
    const mockToken = {
      scope: 'mock-scope',
      raw: 'raw-auth-token',
      email: 'mock-email',
      isDataAdmin: () => true,
      isSuperAdmin: () => false,
    };
    const requestData: RequestData = {
      entityManager,
      token: mockToken,
    };
    const service = new DataMappingService();
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id, file.id);
    const results = await vdl.getDataPreview(entityManager, dataMappingConfig);
    await entityManager.query(`DROP TABLE IF EXISTS "file_${file.id}_raw" CASCADE`);
    expect(results.length).toBe(DATA_PREVIEW_SIZE - (dataMappingConfig.drop_records ? dataMappingConfig.drop_records.length : 0));
    const resultBdfi33 = results.map(r => parseFloat(r.bdfi33)).filter(n => !isNaN(n));
    const maxBdfi33 = resultBdfi33.length ? Math.max(...resultBdfi33) : null;
    expect(maxBdfi33).toBeLessThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfi33.max_val);
    const resultBdfiod = results.map(r => parseFloat(r.bdfiod)).filter(n => !isNaN(n));
    const minBdfiod = resultBdfiod.length ? Math.min(...resultBdfiod) : null;
    expect(minBdfiod).toBeGreaterThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfiod.min_val);
    const resultRecordIds = results.map(r => parseFloat(r.record_id));
    const maxRecordId = Math.max(...resultRecordIds);
    expect(maxRecordId).toBe(10135);
  });
  it('rawRecordToDataModel should create new features, layers, dataset_layers and observations', async () => {
    const { dataset, file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const vdl = new VectorDataLoad();
    const entityManager = await getEntityManager();
    const mockToken = {
      scope: 'mock-scope',
      raw: 'raw-auth-token',
      email: 'mock-email',
      isDataAdmin: () => true,
      isSuperAdmin: () => false,
    };
    const requestData: RequestData = {
      entityManager,
      token: mockToken,
    };
    const service = new DataMappingService();
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id, file.id);
    await vdl.rawRecordToDataModel(entityManager, dataMappingConfig, 10002, dataset.id);
    await entityManager.query(`DROP TABLE IF EXISTS "file_${file.id}_raw" CASCADE`);
    const FeatureRepo = entityManager.getRepository(FeatureEntity);
    const features = await FeatureRepo.find();
    expect(features.length).toBeGreaterThan(0);
    const LayerRepo = entityManager.getRepository(LayerEntity);
    const layers = await LayerRepo.find();
    expect(layers.length).toBeGreaterThan(0);
    const DatasetLayerRepo = entityManager.getRepository(DatasetLayerEntity);
    const datasetLayers = await DatasetLayerRepo.find();
    expect(datasetLayers.length).toBeGreaterThan(0);
    const ObservationRepo = entityManager.getRepository(ObservationEntity);
    const observations = await ObservationRepo.find();
    expect(observations.length).toBeGreaterThan(0);
  });
});
