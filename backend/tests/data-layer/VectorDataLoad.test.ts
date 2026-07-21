import { randomUUID } from 'crypto';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { getEntityManager } from '../../src/utils/data-source';
import { getRawTableName } from '../../src/utils/utils';
import { DATA_PREVIEW_SIZE, OUTSIDE_LOD_VALUE } from '../../src/constants/constants';
import { addSyntheticIngestionData, addSyntheticIngestionDataManyCols, syntheticIngestionDataOptions } from '../../src/utils/mock';
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
      sub: 'mock-sub',
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
    // Results: after removal of min_val, max_val, minimum data requirement (Including sentinel): 6 (with user-deleted records)
    expect(results.length).toBe(6);
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
    // bdfi33 in raw data insert has 6 non-null values, 3 of them are 0 or negative (should be NULL), 1 is out of bounds (original unit %, value>100), and 2 of them are below LOD (should be NULL and reported as below_lod)
    expect(resultBdfi33.length).toBe(2);
    expect(resultBdfi33.filter(n => n === OUTSIDE_LOD_VALUE).length).toBe(0);
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
      sub: 'mock-sub',
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

    // Results: after removal of min_val, max_val, minimum data requirement (Including sentinel and user-dropped values): 6
    expect(allIds).toHaveLength(6);
    expect(new Set(allIds).size).toBe(6);
  });
  describe('Data preview should clean the values as required', () => {
    let fileId: string | null = null;
    let dataMappingConfig: DataCleaningConfig | null = null;

    beforeEach(async () => {
      const { file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
      const entityManager = await getEntityManager();
      const mockToken = {
        sub: 'mock-sub',
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

    it('should remove rows with invalid ranges in "depth" field', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      const dataMappingDepthRange: DataCleaningConfig = {
        ...dataMappingConfig!,
        metadata_cols: {
          sampling_date: 'date',
          license: 'licence',
          horizon: 'layer_name',
          depth: 'depthrange2',
        },
      };
      // depth2 column has 4 values with 2 hyphens and 4 values with integer
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingDepthRange, fileId!);
      expect(
        stats.row_deletions
          .filter(rd => rd.reason === RowDeleteReason.INVALID_DEPTH_INTERVAL)
          .map(f => f.count)
          .pop(),
      ).toBe(8);
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
    it('should count converted values only when conversion formula is not "x"', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      const dataMappingStdUnit: DataCleaningConfig = {
        ...dataMappingConfig!,
        metadata_cols: {
          sampling_date: 'date',
          license: 'licence',
          horizon: 'layer_name',
          min_depth: 'min_depth2',
          max_depth: 'max_depth2',
        },
        property_cols: {
          ...dataMappingConfig!.property_cols,
          bdfiod: {
            ...dataMappingConfig!.property_cols.bdfiod,
            conversion_formula: 'x',
            original_unit: 'mmolc/dm3',
            standard_unit: 'mmolc/dm3',
          },
        },
      };
      const results = await vdl.getDataPreview(entityManager, dataMappingStdUnit, fileId!);
      const resultBdfi33 = results.map(r => parseFloat(r.bdfi33 as string)).filter(n => !isNaN(n) && n !== OUTSIDE_LOD_VALUE);
      expect(resultBdfi33.length).toBeGreaterThan(0);
      // Stats values should be coherent with cleaned up data:
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingStdUnit, fileId!);
      expect(
        stats.modifications
          .filter(m => m.reason === CellModifyReason.UNIT_CONVERTED)
          .map(f => f.count)
          .pop(),
      ).toBe(resultBdfi33.length);
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
    it('should report non_numeric cell deletion for text column values mapped as properties', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      // depthrange contains '100.5-200 cm' for every row — a non-numeric string.
      // Including it as a property alongside bdfi33/bdfiod ensures rows still survive
      // minimum_data_requirement (other props have valid values), so the cell deletion
      // is visible in stats.
      const dataMappingWithTextProp: DataCleaningConfig = {
        ...dataMappingConfig!,
        property_cols: {
          ...dataMappingConfig!.property_cols,
          depthrange: { ...dataMappingConfig!.property_cols.bdfi33 },
        },
      };
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingWithTextProp, fileId!);
      const nonNumericDeletion = stats.cell_deletions.find(d => d.reason === CellDeleteReason.NON_NUMERIC && d.property === 'depthrange');
      expect(nonNumericDeletion).toBeDefined();
      expect(nonNumericDeletion!.count).toBeGreaterThan(0);
    });
    it('should null out values below LOD (-999) and report them as below_lod cell deletions', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      // bdfiod's default min_val (0.1, after the /10 conversion) would OOB-reject bdfiod for
      // rows 10085/10087 too, making the whole row fail minimum_data_requirement and hiding
      // the below_lod cell reason from the stats. Relax it so only bdfi33's sentinel is at play.
      const dataMappingNoBdfiodFloor: DataCleaningConfig = {
        ...dataMappingConfig!,
        property_cols: {
          ...dataMappingConfig!.property_cols,
          bdfiod: { ...dataMappingConfig!.property_cols.bdfiod, conversion_formula: 'x', min_val: 0 },
        },
      };
      const results = await vdl.getDataPreview(entityManager, dataMappingNoBdfiodFloor, fileId!);
      const resultBdfi33 = results.map(r => parseFloat(r.bdfi33 as string)).filter(n => !isNaN(n));
      // Both -999 rows (10085, 10087) should be cleaned to NULL instead of kept as the literal sentinel.
      expect(resultBdfi33.filter(n => n === OUTSIDE_LOD_VALUE).length).toBe(0);
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingNoBdfiodFloor, fileId!);
      const belowLodDeletion = stats.cell_deletions.find(d => d.reason === CellDeleteReason.BELOW_LOD && d.property === 'bdfi33');
      expect(belowLodDeletion).toBeDefined();
      expect(belowLodDeletion!.count).toBe(2);
    });
    it('should still report negative_value (not below_lod) for genuine negative property values', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      // Same rationale as above: relax bdfiod's floor so rows 10088/10089 survive on bdfiod
      // and their bdfi33 negative-value reason is visible in the stats.
      const dataMappingNoBdfiodFloor: DataCleaningConfig = {
        ...dataMappingConfig!,
        property_cols: {
          ...dataMappingConfig!.property_cols,
          bdfiod: { ...dataMappingConfig!.property_cols.bdfiod, conversion_formula: 'x', min_val: 0 },
        },
      };
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingNoBdfiodFloor, fileId!);
      // bdfi33 raw data has two genuine negative (non-sentinel) values: -2 (10088) and -3 (10089).
      const negativeDeletion = stats.cell_deletions.find(d => d.reason === CellDeleteReason.NEGATIVE_VALUE && d.property === 'bdfi33');
      expect(negativeDeletion).toBeDefined();
      expect(negativeDeletion!.count).toBe(2);
    });
    it('should scale OOB threshold by conversion formula when original_unit is %', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      // With original_unit='%' and formula x*100 max val should be 100*100 - one value OOB, two valid ones.
      const dataMappingOriginalPercent: DataCleaningConfig = {
        ...dataMappingConfig!,
        property_cols: {
          ...dataMappingConfig?.property_cols,
          bdfi33: {
            ...dataMappingConfig!.property_cols.bdfi33,
            original_unit: '%',
            standard_unit: 'g/kg',
            conversion_formula: 'x*100',
            max_val: undefined,
          },
        },
      };
      const results = await vdl.getDataPreview(entityManager, dataMappingOriginalPercent, fileId!);
      const resultBdfi33 = results.map(r => parseFloat(r.bdfi33 as string)).filter(n => !isNaN(n) && n !== OUTSIDE_LOD_VALUE);
      expect(resultBdfi33.length).toBe(2);
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingOriginalPercent, fileId!);
      expect(stats.cell_deletions.find(d => d.reason === CellDeleteReason.OOB && d.property === 'bdfi33')).toBeDefined();
      expect(stats.cell_deletions.find(d => d.reason === CellDeleteReason.OOB && d.property === 'bdfi33')!.count).toBe(1);
    });

    it('should keep only the dominant data type and report the rest as mixed_data_type', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      const table = getRawTableName(fileId!);
      // Points dominate the fixture; add polygons plus an unsupported geometry type
      await entityManager.query(`ALTER TABLE ${table} ALTER COLUMN geometry TYPE public.geometry`);
      await entityManager.query(`INSERT INTO ${table} (record_id, geometry) VALUES
        (20001, 'SRID=4326;POLYGON ((0 0, 0 1, 1 1, 1 0, 0 0))'::public.geometry),
        (20002, 'SRID=4326;POLYGON ((2 2, 2 3, 3 3, 3 2, 2 2))'::public.geometry),
        (20003, 'SRID=4326;LINESTRING (0 0, 1 1)'::public.geometry)`);
      const results = await vdl.getDataPreview(entityManager, dataMappingConfig!, fileId!);
      expect(results.length).toBe(6);
      expect(results.every(r => Number(r.record_id) < 20000)).toBe(true);
      const stats = await vdl.getDataPreviewStats(entityManager, dataMappingConfig!, fileId!);
      // mixed_data_type wins over every other delete reason, so all 3 added rows land there
      expect(stats.row_deletions.find(rd => rd.reason === RowDeleteReason.MIXED_DATA_TYPE)?.count).toBe(3);
    });

    it('should break data type ties in favour of point and never let unsupported types win', async () => {
      const vdl = new VectorDataLoad();
      const entityManager = await getEntityManager();
      const tieFileId = randomUUID();
      const table = getRawTableName(tieFileId);
      await entityManager.query(`CREATE TABLE ${table} (record_id int PRIMARY KEY, myprop float8, geometry public.geometry)`);
      // 2 points vs 2 polygons (tie) plus 3 linestrings (a plurality, but unsupported)
      await entityManager.query(`INSERT INTO ${table} (record_id, myprop, geometry) VALUES
        (1, 1.5, 'SRID=4326;POINT (10 10)'::public.geometry),
        (2, 2.5, 'SRID=4326;POINT (20 20)'::public.geometry),
        (3, 3.5, 'SRID=4326;POLYGON ((0 0, 0 1, 1 1, 1 0, 0 0))'::public.geometry),
        (4, 4.5, 'SRID=4326;POLYGON ((2 2, 2 3, 3 3, 3 2, 2 2))'::public.geometry),
        (5, 5.5, 'SRID=4326;LINESTRING (0 0, 1 1)'::public.geometry),
        (6, 6.5, 'SRID=4326;LINESTRING (1 1, 2 2)'::public.geometry),
        (7, 7.5, 'SRID=4326;LINESTRING (2 2, 3 3)'::public.geometry)`);
      const config: DataCleaningConfig = { metadata_cols: {}, property_cols: { myprop: { property_id: 'test-prop' } } };
      const results = await vdl.getDataPreview(entityManager, config, tieFileId);
      expect(results.map(r => Number(r.record_id)).sort()).toEqual([1, 2]);
      results.forEach(r => expect(r.geometry.type).toBe('Point'));
      const stats = await vdl.getDataPreviewStats(entityManager, config, tieFileId);
      expect(stats.row_deletions.find(rd => rd.reason === RowDeleteReason.MIXED_DATA_TYPE)?.count).toBe(5);
    });
  });
  it('Data preview and stats should handle files with >50 columns', async () => {
    const { fileId, dataMappingId } = await addSyntheticIngestionDataManyCols();
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
    const dataMappingConfig = await service.parseDataMapping(requestData, dataMappingId);
    const results = await vdl.getDataPreview(entityManager, dataMappingConfig, fileId!);
    // Keeps all mapped property columns plus 8 fixed fields in SoilRecord + cursor
    expect(Object.keys(results[0]).length).toBe(Object.keys(dataMappingConfig.property_cols).length + 9);
    const stats = await vdl.getDataPreviewStats(entityManager, dataMappingConfig, fileId!);
    expect(stats).toBeDefined();
  });
  it('rawRecordToDataModel should create new features, layers, dataset_layers and observations', async () => {
    const { dataset, file, dataMapping } = await addSyntheticIngestionData({ ...syntheticIngestionDataOptions });
    const vdl = new VectorDataLoad();
    const entityManager = await getEntityManager();
    const mockToken = {
      sub: 'mock-sub',
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
      sub: 'mock-sub',
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
