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
import { PreviewRecord } from '../../src/interfaces/Record';

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
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id);
    const results = await vdl.getDataPreview(entityManager, dataMappingConfig, file.id);
    await entityManager.query(`DROP TABLE IF EXISTS ${process.env.POSTGRES_SCHEMA}."file_${file.id}_raw" CASCADE`);
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
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id);
    const record = (await vdl.getDataPreview(entityManager, dataMappingConfig, file.id, 1))[0] as PreviewRecord;
    await vdl.rawRecordToDataModel(entityManager, dataMappingConfig, record, dataset.id);
    await entityManager.query(`DROP TABLE IF EXISTS ${process.env.POSTGRES_SCHEMA}."file_${file.id}_raw" CASCADE`);
    const features = await entityManager.find(FeatureEntity);
    expect(features.length).toBeGreaterThan(0);
    const layers = await entityManager.find(LayerEntity);
    expect(layers.length).toBeGreaterThan(0);
    const datasetLayers = await entityManager.find(DatasetLayerEntity);
    expect(datasetLayers.length).toBeGreaterThan(0);
    const observations = await entityManager.find(ObservationEntity);
    expect(observations.length).toBeGreaterThan(0);
  });
});
