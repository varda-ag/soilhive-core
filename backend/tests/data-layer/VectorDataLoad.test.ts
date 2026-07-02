import { describe, it, expect, beforeEach } from '@jest/globals';
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
import { DataCleaningConfig } from '../../src/interfaces/DataMapping';
import { CellModifyReason, RowDeleteReason, CellDeleteReason } from '../../src/interfaces/CleaningReport';

describe('VectorDataLoad class', () => {
  it('Data preview and stats should be generated based on parsed data mapping', async () => {
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
    // Results: after removal of min_val, max_val, minimum data requirement (Including sentinel): 8 (with user-deleted records)
    expect(results.length).toBe(8);
    expect(results.filter(r => r.user_dropped === true).length).toBe(dataMappingConfig.drop_records?.length);
    const resultBdfi33 = results.map(r => parseFloat(r.bdfi33 as string)).filter(n => !isNaN(n));
    const maxBdfi33 = resultBdfi33.length ? Math.max(...resultBdfi33) : null;
    expect(maxBdfi33).toBeLessThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfi33.max_val);
    const resultBdfiod = results.map(r => parseFloat(r.bdfiod as string)).filter(n => !isNaN(n));
    const minBdfiod = resultBdfiod.length ? Math.min(...resultBdfiod) : null;
    expect(minBdfiod).toBeGreaterThanOrEqual(syntheticIngestionDataOptions.columnMapping.bdfiod.min_val);
    const resultRecordIds = results.map(r => parseFloat(r.record_id as unknown as string));
    const maxRecordId = Math.max(...resultRecordIds);
    expect(maxRecordId).toBe(10137);
    // bdfi33 in raw data insert has 6 non-null values, 3 of them are 0 or negative (should be NULL), and 2 of them are less than LOD (should stay as is, no conversion formula "x*10" applied)
    expect(resultBdfi33.length).toBe(5);
    expect(resultBdfi33.filter(n => n === OUTSIDE_LOD_VALUE).length).toBe(2);
    // Stats values should be coherent with cleaned up data:
    const stats = await vdl.getDataPreviewStats(entityManager, dataMappingConfig, file.id);
    expect(stats.summary.rows_deleted - dataMappingConfig.drop_records!.length).toBe(DATA_PREVIEW_SIZE - results.length);
    expect(
      stats.row_deletions
        .filter(rd => rd.reason === RowDeleteReason.USER_DELETION)
        .map(f => f.count)
        .pop(),
    ).toBe(dataMappingConfig.drop_records?.length);
    // Values with >3 decimals: 2
    expect(
      stats.modifications
        .filter(rd => rd.reason === CellModifyReason.VALUE_ROUNDED)
        .map(f => f.count)
        .pop(),
    ).toBe(2);
  });
  it('sorted cursor pagination should visit every record exactly once', async () => {
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
    const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };
    const service = new DataMappingService();
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id);

    const allIds: number[] = [];
    let cursor: string | undefined;
    let iterations = 0;

    do {
      const page = await vdl.getDataPreview(entityManager, dataMappingConfig, file.id, 3, true, cursor, 'min_depth');
      if (!page.length) break;
      allIds.push(...page.map(r => Number(r.record_id)));
      cursor = page[page.length - 1].cursor as string;
      iterations++;
    } while (iterations < 20);

    // Results: after removal of min_val, max_val, minimum data requirement (Including sentinel and user-dropped values): 8
    expect(allIds).toHaveLength(8);
    expect(new Set(allIds).size).toBe(8);
  });
  describe('Data preview should clean the values as required', () => {
    let fileId: string | null = null;
    let dataMappingConfig: DataCleaningConfig | null = null;

    beforeEach(async () => {
      const { file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
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
      dataMappingConfig = await service.parseDataMapping(requestData, dataMapping.id);
      fileId = file.id;
    });

    it('should parse "depth" field to min and max depth and round to int', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      const dataMappingDepthRange: DataCleaningConfig = {
        ...dataMappingConfig!,
        metadata_cols: {
          sampling_date: 'date',
          license: 'licence',
          horizon: 'layer_name',
          depth: 'depthrange',
        },
      };
      const results = await vdl.getDataPreview(entityManager, dataMappingDepthRange, fileId!);
      expect(results[0].min_depth).toBe(101);
      expect(results[0].max_depth).toBe(200);
      // Stats values should be coherent with cleaned up data:
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingDepthRange, fileId!);
      expect(
        stats.modifications
          .filter(m => m.reason === CellModifyReason.DEPTH_ROUNDED)
          .map(f => f.count)
          .pop(),
      ).toBe(results.length - dataMappingDepthRange.drop_records!.length);
    });
    it('should set negative min/max depth values to NULL', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      const dataMappingNegativeDepths: DataCleaningConfig = {
        ...dataMappingConfig!,
        metadata_cols: {
          sampling_date: 'date',
          license: 'licence',
          horizon: 'layer_name',
          min_depth: 'min_depth2',
          max_depth: 'max_depth2',
        },
      };
      const results = await vdl.getDataPreview(entityManager, dataMappingNegativeDepths, fileId!);
      expect(results.map(r => r.min_depth).filter(n => n !== null).length).toBe(0);
      expect(results.map(r => r.max_depth).filter(n => n !== null).length).toBe(0);
      // Stats values should be coherent with cleaned up data:
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingNegativeDepths, fileId!);
      expect(
        stats.cell_deletions
          .filter(m => m.reason === CellDeleteReason.NEGATIVE_VALUE && m.property === 'max_depth')
          .map(f => f.count)
          .pop(),
      ).toBe(results.length - dataMappingNegativeDepths.drop_records!.length);
      expect(
        stats.cell_deletions
          .filter(m => m.reason === CellDeleteReason.NEGATIVE_VALUE && m.property === 'min_depth')
          .map(f => f.count)
          .pop(),
      ).toBe(results.length - dataMappingNegativeDepths.drop_records!.length);
    });
    it('should remove % soil property values above 100', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      const dataMappingPropertyPercent: DataCleaningConfig = {
        ...dataMappingConfig!,
        property_cols: {
          bdfi33: {
            property_id: dataMappingConfig!.property_cols.bdfi33.property_id,
            procedure_id: dataMappingConfig!.property_cols.bdfi33.procedure_id,
            conversion_id: dataMappingConfig!.property_cols.bdfi33.conversion_id,
            standard_unit: '%',
            conversion_formula: 'x*100',
          },
        },
      };
      const results = await vdl.getDataPreview(entityManager, dataMappingPropertyPercent, fileId!);
      const resultBdfi33 = results.map(r => parseFloat(r.bdfi33 as string)).filter(n => !isNaN(n) && n !== OUTSIDE_LOD_VALUE);
      // bdfi33 value in raw_data_insert.sql that are not 0, not negative, not BELOW_LOD and less than 1 (after converting, less than 100%) is 1
      expect(resultBdfi33.length).toBe(1);
    });
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
    const record = (await vdl.getDataPreview(entityManager, dataMappingConfig, file.id, 1, false))[0] as SoilRecord;
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
  it('rawRecordToDataModel with missing metadata columns should insert null for these fields but keep 0 value metadata', async () => {
    const { dataset, file, dataMapping } = await addSyntheticIngestionData({
      ...syntheticIngestionDataOptions,
      columnMapping: {
        upper_depth: 'min_depth',
        lower_depth: 'max_depth',
        date: 'sampling_date',
        licence: 'license',
        bdfi33: {
          property_name: 'Bulk Density',
        },
        bdfiod: {
          property_name: 'Bulk Density 2',
        },
        drop_records: [10136, 10137],
      },
    });
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
    const records = (await vdl.getDataPreview(entityManager, dataMappingConfig, file.id, 20, false)) as SoilRecord[];
    const promises = records.map(async record => await vdl.rawRecordToDataModel(entityManager, dataMappingConfig, record, dataset.id));
    await Promise.all(promises);
    const layers = await entityManager.find(LayerEntity);
    expect(layers.length).toBeGreaterThan(0);
    // Horizon not specified in column mapping:
    expect(layers.map(l => l.horizon).filter(e => e !== null).length).toBe(0);
    // Min depth with value 0 should be kept as value 0 (4 occurrences):
    expect(layers.map(l => l.min_depth).filter(e => e === 0).length).toBe(4);
  });
});
