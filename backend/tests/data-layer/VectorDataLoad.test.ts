import { describe, it, expect } from '@jest/globals';
import { getEntityManager } from '../../src/utils/data-source';
import { DATA_PREVIEW_SIZE, OUTSIDE_LOD_VALUE } from '../../src/constants/constants';
import { addSyntheticIngestionData, syntheticIngestionDataOptions } from '../../src/utils/mock';
import VectorDataLoad from '../../src/data-layer/VectorDataLoad';
import DataMappingService from '../../src/services/DataMappingService';
import { RequestData } from '../../src/interfaces/RequestData';
import FeatureEntity from '../../src/entities/Feature';
import LayerEntity from '../../src/entities/Layer';
import DatasetLayerEntity from '../../src/entities/DatasetLayer';
import ObservationEntity from '../../src/entities/Observation';
import { SoilRecord } from '../../src/interfaces/Record';

describe('VectorDataLoad class', () => {
  it('Data preview should be generated based on parsed data mapping', async () => {
    const { file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const vdl = new VectorDataLoad();
    const entityManager = await getEntityManager();
    const mockToken = {
      scope: 'mock-scope',
      raw: 'raw-auth-token',
      email: 'mock-email',
      isDataAdmin: true,
      isSuperAdmin: false,
      isInternalRequest: false,
    };
    const requestData: RequestData = {
      entityManager,
      token: mockToken,
      entitlements: {},
    };
    const service = new DataMappingService();
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id);
    const results = await vdl.getDataPreview(entityManager, dataMappingConfig, file.id);
    expect(results.length).toBe(DATA_PREVIEW_SIZE - (dataMappingConfig.drop_records ? dataMappingConfig.drop_records.length : 0));
    const resultBdfi33 = results.map(r => parseFloat(r.bdfi33 as string)).filter(n => !isNaN(n));
    const maxBdfi33 = resultBdfi33.length ? Math.max(...resultBdfi33) : null;
    expect(maxBdfi33).toBeLessThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfi33.max_val);
    const resultBdfiod = results.map(r => parseFloat(r.bdfiod as string)).filter(n => !isNaN(n));
    const minBdfiod = resultBdfiod.length ? Math.min(...resultBdfiod) : null;
    expect(minBdfiod).toBeGreaterThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfiod.min_val);
    const resultRecordIds = results.map(r => parseFloat(r.record_id as string));
    const maxRecordId = Math.max(...resultRecordIds);
    expect(maxRecordId).toBe(10102);
    // bdfi33 in raw data insert has 6 non-null values, 1 of them is 0 (should be NULL) and 2 of them are less than LOD (should stay as is, no conversion formula "x*10" applied)
    expect(resultBdfi33.length).toBe(5);
    expect(resultBdfi33.filter(n => n === OUTSIDE_LOD_VALUE).length).toBe(2);
  });
  it('rawRecordToDataModel should create new features, layers, dataset_layers and observations', async () => {
    const { dataset, file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const vdl = new VectorDataLoad();
    const entityManager = await getEntityManager();
    const mockToken = {
      scope: 'mock-scope',
      raw: 'raw-auth-token',
      email: 'mock-email',
      isDataAdmin: true,
      isSuperAdmin: false,
      isInternalRequest: false,
    };
    const requestData: RequestData = {
      entityManager,
      token: mockToken,
      entitlements: {},
    };
    const service = new DataMappingService();
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id);
    const record = (await vdl.getDataPreview(entityManager, dataMappingConfig, file.id, 1))[0] as SoilRecord;
    await vdl.rawRecordToDataModel(entityManager, dataMappingConfig, record, dataset.id);
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
