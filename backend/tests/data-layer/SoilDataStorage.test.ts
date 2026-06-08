import { describe, it, expect, beforeEach, jest, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as turf from '@turf/turf';
import { MultiPolygon, Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { addDataset, addRasterData, addRasterDataset, addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import SoilDataStorage, { buildDatasetFilterClauses } from '../../src/data-layer/SoilDataStorage';
import DatasetEntity from '../../src/entities/Dataset';
import { decodeCursor } from '../../src/utils/cursor';
import { addRasterFilterData, addRasterFilterMappings } from '../helper';
import { GISDataType, IngestionStatus } from '../../src/types/data';
import * as RasterUtilsModule from '../../src/utils/raster';
import * as FilteringMasksModule from '../../src/data-layer/FilteringMasks';
import { invalidGeometryPayload } from './invalidGeometryPayload.ts';
import { getRasterMask, getVectorMaskGeometry as getVectorMask } from '../../src/data-layer/FilteringMasks';
import { FilterCriteria } from '../../src/interfaces/DatasetFilter';
import path from 'path';

const bbox = [0, 0, 1, 1];
const bboxPolygon: Polygon = getPolygonFromBbox(bbox);

const insertUserGeometry = async (entityManager: any, geometry: Polygon | MultiPolygon): Promise<string> => {
  const [{ id }] = await entityManager.query(
    `INSERT INTO user_geometries (geom) VALUES (ST_GeomFromGeoJSON($1)) ON CONFLICT (geom_hash) DO UPDATE SET geom = EXCLUDED.geom RETURNING id`,
    [JSON.stringify(geometry)],
  );
  return id;
};
const entitlements = {};
const filteringMaskCoordinates = [
  [-80.721933926, -33.788328755],
  [-80.721933926, -33.783977188],
  [-80.717474913, -33.783977188],
  [-80.717474913, -33.788328755],
  [-80.721933926, -33.788328755],
];

describe('SoilDataStorage class', () => {
  it.each([
    [[0, 0, 10, 10], [0, 0, 11, 11], 'full'],
    [[0, 0, 10, 10], [5, 5, 15, 15], 'partial'],
    [[0, 0, 10, 10], [20, 20, 30, 30], 'none'],
  ])('Dataset overlap type', async (datasetBbox, queryBbox, expectedType) => {
    const dataset = await addDataset(`dataset_overlap_test_${expectedType}`, datasetBbox);
    const query: Polygon = getPolygonFromBbox(queryBbox);

    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const overlapMap = await sds.getOverlapType(entityManager, query);
    expect(overlapMap.size).toBe(1);
    const overlapType = overlapMap.get(dataset.id);
    expect(overlapType).toBeDefined();
    expect(overlapType).toEqual(expectedType);
  });

  it.each([GISDataType.POINT, GISDataType.POLYGONAL])('Filtering should return some results', async (featureGeometryType: string) => {
    const layers = 5;
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      depthLayers: layers,
      soilPropertyNames: ['prop1', 'prop2'],
      featureGeometryType,
    });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const geomId = await insertUserGeometry(entityManager, getPolygonFromBbox([0, 0, 10, 10]));
    const results = await sds.filterVector(entityManager, geomId, {});
    expect(results.length).toBe(1);
    expect(results[0].dataset_layer_count).toBe(layers);
    expect(results[0].soil_properties).toContain('prop1');
    expect(results[0].soil_properties).toContain('prop2');
    expect(results[0].licenses).toContain('test_license_1');
    expect(results[0].visibility).toBe('public');
    const resultDatasetIds = results.map(r => r.id);
    expect(resultDatasetIds).toContain(dataset.slug);
  });

  it.each([
    ['point', 2],
    ['polygonal', 0],
    ['raster', 0],
    [undefined, 0],
    ['', 0],
    ['wrong', 0],
  ])('Filtering by GIS data type should return expected datasets', async (filterType, expectedDatasetCount) => {
    const datasets: DatasetEntity[] = [];
    for (let i = 0; i < expectedDatasetCount; i++) {
      // Always a point dataset
      datasets.push((await addSyntheticData({ ...syntheticDataOptions, id: i, soilPropertyNames: [`${i}`] })).dataset);
    }
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const bboxGeomId = await insertUserGeometry(entityManager, bboxPolygon);
    const results = await sds.filterVector(entityManager, bboxGeomId, {
      data_types: [filterType as GISDataType],
    });
    expect(results.length).toBe(expectedDatasetCount);
    for (let i = 0; i < expectedDatasetCount; i++) {
      expect(datasets.map(d => d.slug)).toContain(results[i].id);
    }
  });

  it.each([
    [undefined, undefined, 1, 10],
    [-100, undefined, 1, 10],
    [undefined, 100, 1, 10],
    [100, undefined, 1, 1], // 100 touches max depth
    [undefined, 0, 1, 1], // 0 touches min depth
    [200, undefined, 0, 0], // No depth interval overlap
    [undefined, -200, 0, 0], // No depth interval overlap
    [0, 10, 1, 2], // 0-10 touches layers 0-10 and 10-20
    [0, 50, 1, 6], // 0-50 touches layers 0-10, 10-20, 20-30, 30-40, 40-50, 50-60
    [0, 90, 1, 10],
    [0, 100, 1, 10],
    [-1000, 1000, 1, 10],
    [-2000, -1000, 0, 0],
    [1000, 2000, 0, 0],
  ])('Filtering by depth should return expected data points', async (min_depth, max_depth, expectedResultCount, expectedCount) => {
    await addSyntheticData({ ...syntheticDataOptions, depthLayers: 10 }); // 10 layers with depths 0-100
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const bboxGeomId = await insertUserGeometry(entityManager, bboxPolygon);
    const filterResults = await sds.filterVector(entityManager, bboxGeomId, {
      min_depth,
      max_depth,
    });
    expect(filterResults.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      expect(filterResults[0].dataset_layer_count).toBe(expectedCount);
    }
    const datasetResults = await sds.filterVectorDatasets(entityManager, bboxPolygon, { min_depth, max_depth });
    expect(datasetResults.length).toBe(expectedResultCount);
    expect(datasetResults.map(ds => ds.id).sort()).toEqual(filterResults.map(ds => ds.id).sort());
  });

  it.each([
    [undefined, undefined, 5],
    ['1999-01-01', undefined, 5],
    [undefined, '2222-01-01', 5],
    ['2020-01-01', undefined, 5], // Default synthetic data sampling date is (2020 + id)-01-01 to (2020 + id)-12-31
    [undefined, '2020-01-01', 1],
    ['2222-01-01', undefined, 0], // No overlap
    [undefined, '1999-01-01', 0], // No depth interval overlap
    ['2020-01-01', '2022-01-01', 3], // touches layers 2021 and 2022
    ['2020-01-01', '2023-01-01', 4], // touches layers 2021, 2022, 2023
    ['2020-01-01', '2024-01-01', 5],
    ['1999-01-01', '2222-01-01', 5],
    ['1000-01-01', '1999-01-01', 0],
    ['2222-01-01', '3333-01-01', 0],
  ])('Filtering by sampling date should return expected data points', async (min_sampling_date, max_sampling_date, expectedResultCount) => {
    for (let i = 0; i < 5; i++) {
      await addSyntheticData({ ...syntheticDataOptions, id: i, soilPropertyNames: [`${i}`] }); // 5 iterations covering 2020-01-01 to 2024-01-01
    }
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const bboxGeomId = await insertUserGeometry(entityManager, bboxPolygon);
    const filterResults = await sds.filterVector(entityManager, bboxGeomId, {
      min_sampling_date,
      max_sampling_date,
    });
    expect(filterResults.length).toBe(expectedResultCount);
    const datasetResults = await sds.filterVectorDatasets(entityManager, bboxPolygon, { min_sampling_date, max_sampling_date });
    expect(datasetResults.length).toBe(expectedResultCount);
    expect(datasetResults.map(ds => ds.id).sort()).toEqual(filterResults.map(ds => ds.id).sort());
  });

  it.each([
    [undefined, 2, 20],
    [[], 2, 20],
    [[undefined], 0, 0],
    [['X'], 0, 0],
    [['A1'], 2, 3],
    [['A9'], 1, 1],
    [['A1', 'A2'], 2, 6],
    [['A8', 'A9'], 1, 2],
  ])('Filtering by horizon should return expected data points', async (horizons, expectedResultCount, expectedCount) => {
    await addSyntheticData({ ...syntheticDataOptions, depthLayers: 10 }); // 10 layers with horizons A0 -> A9
    await addSyntheticData({
      ...syntheticDataOptions,
      id: 2,
      depthLayers: 5,
      featureCount: 2,
      observationsPerLayer: 2,
      soilPropertyNames: ['x'],
    }); // 5 layers with horizons A0 -> A4, two observations per layer
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const bboxGeomId = await insertUserGeometry(entityManager, bboxPolygon);
    const filterResults = await sds.filterVector(entityManager, bboxGeomId, { horizons } as any);
    expect(filterResults.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      const total: number = filterResults.reduce((acc, curr) => acc + curr.dataset_layer_count!, 0);
      expect(total).toBe(expectedCount);
    }
    const datasetResults = await sds.filterVectorDatasets(entityManager, bboxPolygon, { horizons } as any);
    expect(datasetResults.length).toBe(expectedResultCount);
    expect(datasetResults.map(ds => ds.id).sort()).toEqual(filterResults.map(ds => ds.id).sort());
  });

  it.each([
    [undefined, 2, 20],
    [[], 2, 20],
    [[undefined], 0, 0],
    [['a'], 1, 5],
    [['a', 'b'], 1, 10],
    [['c'], 1, 5],
    [['a', 'c'], 2, 10],
    [['a', 'b', 'c', 'd'], 2, 20],
    [['x'], 0, 0],
  ])('Filtering by soil properties should return expected data points', async (filter, expectedResultCount, expectedCount) => {
    await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['a', 'b'], depthLayers: 10 });
    await addSyntheticData({ ...syntheticDataOptions, id: 2, soilPropertyNames: ['c', 'd'], depthLayers: 10 });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const bboxGeomId = await insertUserGeometry(entityManager, bboxPolygon);
    const filterResults = await sds.filterVector(entityManager, bboxGeomId, {
      soil_properties: filter as any,
    });
    expect(filterResults.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      const total: number = filterResults.reduce((acc, curr) => acc + curr.dataset_layer_count!, 0);
      expect(total).toBe(expectedCount);
    }
    const datasetResults = await sds.filterVectorDatasets(entityManager, bboxPolygon, {
      soil_properties: filter as any,
    });
    expect(datasetResults.length).toBe(expectedResultCount);
    expect(datasetResults.map(ds => ds.id).sort()).toEqual(filterResults.map(ds => ds.id).sort());
  });

  it('filterDatasets should only return PUBLISHED datasets, not LOADED or other statuses', async () => {
    const { dataset: publishedDataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 91,
      soilPropertyNames: ['status_test_pub'],
    });
    const { dataset: loadedDataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 92,
      soilPropertyNames: ['status_test_loaded'],
    });

    const entityManager = await getEntityManager();
    await entityManager.getRepository(DatasetEntity).update(loadedDataset.id, { status: IngestionStatus.LOADED });

    const sds = new SoilDataStorage();
    const results = await sds.filterVectorDatasets(entityManager, bboxPolygon, {});

    expect(results.map(r => r.id)).toContain(publishedDataset.slug);
    expect(results.map(r => r.id)).not.toContain(loadedDataset.slug);
  });

  it('filter (coverage) should only return PUBLISHED datasets, not LOADED or other statuses', async () => {
    const { dataset: publishedDataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 93,
      soilPropertyNames: ['coverage_status_test_pub'],
    });
    const { dataset: loadedDataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 94,
      soilPropertyNames: ['coverage_status_test_loaded'],
    });

    const entityManager = await getEntityManager();
    await entityManager.getRepository(DatasetEntity).update(loadedDataset.id, { status: IngestionStatus.LOADED });

    const sds = new SoilDataStorage();
    const bboxGeomId = await insertUserGeometry(entityManager, bboxPolygon);
    const results = await sds.filterVector(entityManager, bboxGeomId, {});

    expect(results.map(r => r.id)).toContain(publishedDataset.slug);
    expect(results.map(r => r.id)).not.toContain(loadedDataset.slug);
  });

  it.each([
    [{ min_depth: null }, 1, 1],
    [{ max_depth: null }, 1, 1],
    [{ min_depth: null, max_depth: null }, 1, 1],
    [{ min_sampling_date: null }, 1, 1],
    [{ max_sampling_date: null }, 1, 1],
    [{ min_sampling_date: null, max_sampling_date: null }, 1, 1],
    [{ horizons: [null] }, 1, 1],
    [{ horizons: ['A0', null] }, 1, 2],
  ])('Filtering NULL values should return expected data points', async (filter, expectedResultCount, expectedCount) => {
    await addSyntheticData({ ...syntheticDataOptions, depthLayers: 1, addNullValues: true }); // Adding another layer with NULL values
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const bboxGeomId = await insertUserGeometry(entityManager, bboxPolygon);
    const results = await sds.filterVector(entityManager, bboxGeomId, { ...filter });
    expect(results.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      expect(results[0].dataset_layer_count).toBe(expectedCount);
    }
  });

  it.each([
    {},
    { max_depth: null },
    { min_depth: 0, max_depth: 50 },
    { min_sampling_date: '2020' },
    { max_sampling_date: '2025' },
    { min_sampling_date: null, max_sampling_date: null },
    { horizons: [null] },
    { horizons: ['A0', 'A1'] },
  ])('Datasets list query filter builder should have intersection filter as the first clause', filter => {
    const firstClause = `ST_Intersects(f.geom, (SELECT geom FROM aoi))`;
    const schema = 'test';
    const params: any[] = [];
    const p = (val: any) => {
      params.push(val);
      return `$${params.length}`;
    };
    const { lateralWhere } = buildDatasetFilterClauses(filter, p, schema!);

    expect(lateralWhere[0]).toBe(firstClause);
  });

  it('Filtering using cursor and sorting at the same time should return consistent results', async () => {
    const layers = 5;
    const totalObservations = 20;
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      depthLayers: layers,
      soilPropertyNames: ['prop1'],
      featureCount: 2,
      observationsPerLayer: 2,
      useProgressiveObservationValues: true, // Values in the range 1, 2, ..., layers*features*observations = 5*2*2 = 20
    });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const filter = { geometries: [], parameters: {} };
    const limit = 10;
    // Get 10 results sorting by value DESC (20 -> 11)
    const results = await sds.getSoilData({ entityManager, entitlements }, filter, [dataset.slug], limit, undefined, '-value');
    expect(results.length).toBe(limit);
    for (let i = 0; i < limit; i++) {
      // Check that values are in the expected order (20, 19, ..., 11)
      expect(results[i].value).toBe(totalObservations - i);
      // Check that decoded cursors contain expected values
      const cursor = decodeCursor(results[i].cursor);
      expect(cursor.id).toBe(results[i].id);
      expect(cursor.column).toBe('-value');
      expect(cursor.value).toBe(totalObservations - i);
    }
    // Take 10th cursor and get the following 10 results, preserving the sort order
    const moreResults = await sds.getSoilData({ entityManager, entitlements }, filter, [dataset.slug], limit, results[9].cursor, '-value');
    expect(moreResults.length).toBe(limit);
    // Check result values (10 -> 1)
    for (let i = 0; i < limit; i++) {
      expect(moreResults[i].value).toBe(10 - i);
      const cursor = decodeCursor(moreResults[i].cursor);
      expect(cursor.id).toBe(moreResults[i].id);
      expect(cursor.column).toBe('-value');
      expect(cursor.value).toBe(10 - i);
    }
  });

  it('Cursor and sorting should work with fields from different tables', async () => {
    const layers = 5;
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      depthLayers: layers,
      soilPropertyNames: ['prop1'],
      featureCount: 2,
      observationsPerLayer: 2,
    });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const filter = { geometries: [], parameters: {} };
    const limit = 5;

    // Test sorting by min_depth (from layer table) ASC
    const resultsByDepth = await sds.getSoilData({ entityManager, entitlements }, filter, [dataset.slug], limit, undefined, 'min_depth');
    expect(resultsByDepth.length).toBe(limit);
    // Verify depths are in ascending order
    for (let i = 0; i < resultsByDepth.length - 1; i++) {
      expect(resultsByDepth[i].min_depth).toBeLessThanOrEqual(resultsByDepth[i + 1].min_depth!);
      const cursor = decodeCursor(resultsByDepth[i].cursor);
      expect(cursor.column).toBe('min_depth');
    }

    // Get next page using cursor
    const moreDepthResults = await sds.getSoilData(
      { entityManager, entitlements },
      filter,
      [dataset.slug],
      limit,
      resultsByDepth[4].cursor,
      'min_depth',
    );
    if (moreDepthResults.length > 0) {
      // Verify next page starts after previous max depth (or same if there are ties)
      expect(moreDepthResults[0].min_depth).toBeGreaterThanOrEqual(resultsByDepth[4].min_depth!);
    }

    // Test sorting by dataset_name (from dataset table) ASC
    const resultsByDataset = await sds.getSoilData(
      { entityManager, entitlements },
      filter,
      [dataset.slug],
      limit,
      undefined,
      'dataset_name',
    );
    expect(resultsByDataset.length).toBe(limit);
    // All results should have the same dataset name
    for (let i = 0; i < resultsByDataset.length; i++) {
      expect(resultsByDataset[i].dataset_name).toBe(dataset.name);
      const cursor = decodeCursor(resultsByDataset[i].cursor);
      expect(cursor.column).toBe('dataset_name');
    }

    // Test sorting by soil_property (from soil_property table) DESC
    const resultsByProperty = await sds.getSoilData(
      { entityManager, entitlements },
      filter,
      [dataset.slug],
      limit,
      undefined,
      '-soil_property',
    );
    expect(resultsByProperty.length).toBe(limit);
    for (let i = 0; i < resultsByProperty.length; i++) {
      const cursor = decodeCursor(resultsByProperty[i].cursor);
      expect(cursor.column).toBe('-soil_property');
    }
    // Verify cursor pagination works with this sort field
    const morePropertyResults = await sds.getSoilData(
      { entityManager, entitlements },
      filter,
      [dataset.slug],
      limit,
      resultsByProperty[4].cursor,
      '-soil_property',
    );
    // Should either have more results or be at the end
    if (morePropertyResults.length > 0) {
      // Verify we got fresh results
      const firstPageIds = resultsByProperty.map(r => r.id);
      const hasNewIds = morePropertyResults.some(r => !firstPageIds.includes(r.id));
      expect(hasNewIds).toBe(true);
    }
  });

  it('Cursor and sorting should work when sort column contains null values', async () => {
    // laboratory_method is null for all synthetic data (no vocabulary values added)
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      depthLayers: 3,
      soilPropertyNames: ['prop1'],
      featureCount: 2,
      observationsPerLayer: 2,
    });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const filter = { geometries: [], parameters: {} };
    const limit = 6;

    // Page 1 sorting by laboratory_method DESC (all values are null)
    const page1 = await sds.getSoilData({ entityManager, entitlements }, filter, [dataset.slug], limit, undefined, '-laboratory_method');
    expect(page1.length).toBeGreaterThan(0);

    // Page 2: using the last cursor from page 1 must not throw "sort field is not matching cursor"
    const lastCursor = page1[page1.length - 1].cursor;
    const page2 = await sds.getSoilData({ entityManager, entitlements }, filter, [dataset.slug], limit, lastCursor, '-laboratory_method');

    // No row from page 1 should appear on page 2
    const page1Ids = new Set(page1.map(r => r.id));
    for (const row of page2) {
      expect(page1Ids.has(row.id)).toBe(false);
    }
  });

  it('Filtering should work even with an invalid geometry', async () => {
    await addSyntheticData({
      ...syntheticDataOptions,
      spatial_extent: [6.8, 38, 17, 47],
      featureGeometryType: GISDataType.POLYGONAL,
      featureCount: 500,
      squareSide: 0.3,
    });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const geomId = await insertUserGeometry(entityManager, invalidGeometryPayload as MultiPolygon);
    const results = await sds.filterVector(entityManager, geomId, {});
    expect(results.length).toBe(1);
  });

  describe('Raster filtering', () => {
    let mockSelectOverview: any;
    beforeEach(async () => {
      await addRasterFilterData();
      await addRasterFilterMappings();
      // Do not reference any overview (they don't exist in test dump)
      mockSelectOverview = jest.spyOn(RasterUtilsModule, 'selectOverviewTable').mockImplementation((table: string) => {
        return table;
      });
    });

    afterAll(() => {
      mockSelectOverview.mockRestore();
    });

    it.each([
      [[[-80.7811, -33.7413]], [30], 1, 1],
      [[[-80.7811, -33.7413]], [11], 0, 0],
    ])(
      'Filtering using land cover should return expected data points',
      async (featureCoordinates, values, expectedResultCount, expectedFeatureCount) => {
        const tableName = 'land_cover';
        const bbox = [-81, -34, -80, -33];
        const bboxQuery = [-80.7812, -33.7414, -80.781, -33.7412];
        await addSyntheticData({ ...syntheticDataOptions, depthLayers: 1, featureCoordinates, spatial_extent: bbox });
        const sds = new SoilDataStorage();
        const entityManager = await getEntityManager();
        const raster_filters: Record<string, number[]> = {};
        raster_filters[tableName] = values;
        const geomId = await insertUserGeometry(entityManager, getPolygonFromBbox(bboxQuery));
        const filterResults = await sds.filterVector(entityManager, geomId, { raster_filters });
        expect(filterResults.length).toBe(expectedResultCount);
        if (expectedResultCount > 0) {
          expect(filterResults[0].dataset_layer_count).toBe(expectedFeatureCount);
        }
        const datasetResults = await sds.filterVectorDatasets(entityManager, getPolygonFromBbox(bboxQuery), { raster_filters });
        expect(datasetResults.length).toBe(filterResults.length);
        if (expectedResultCount > 0) {
          expect(datasetResults[0].id).toBe(filterResults[0].id);
        }
      },
    );

    it.each([
      [[-81, -34, -80, -33], 1, [0, 90, 20, 60, 112, 30, 80, 126, 200, 116], [6777]],
      [[-82, -35, -81, -32], 1, [200], []],
    ])(
      'Filtering when having raster filters enabled should return all available raster options',
      async (bbox, expectedResultCount, expectedLandCoverOptions: number[], expectedSoilGroupsOptions: number[]) => {
        await addSyntheticData({ ...syntheticDataOptions, depthLayers: 1, featureCount: 100, spatial_extent: bbox });
        const sds = new SoilDataStorage();
        const entityManager = await getEntityManager();
        const geomId = await insertUserGeometry(entityManager, getPolygonFromBbox(bbox));
        const results = await sds.getRasterCoverage(entityManager, [geomId], {});
        if (expectedResultCount > 0) {
          expect((results['land_cover'] as number[])?.sort((a: number, b: number) => a - b)).toEqual(
            expectedLandCoverOptions.sort((a: number, b: number) => a - b),
          );
          expect((results['soil_groups'] as number[])?.sort((a: number, b: number) => a - b)).toEqual(
            expectedSoilGroupsOptions.sort((a: number, b: number) => a - b),
          );
        }
      },
      10000,
    );

    it.each([
      [
        [
          [
            [-80.722896453120683, -33.772227648792125],
            [-80.722896453120683, -33.768670417531609],
            [-80.717031828610118, -33.768670417531609],
            [-80.717031828610118, -33.772227648792125],
            [-80.722896453120683, -33.772227648792125],
          ],
        ],
        'land_cover',
        [30, 60, 200],
      ],
      [
        [
          [
            [-80.79169849775391, -34.00175191246698],
            [-79.98963031915663, -34.00175191246698],
            [-79.98963031915663, -26.110457643667253],
            [-80.79169849775391, -26.110457643667253],
            [-80.79169849775391, -34.00175191246698],
          ],
        ],
        'soil_groups',
        [6776, 6777],
      ],
    ])(
      'Filtering with small area should return only overlapping raster values',
      async (filteringCoords: number[][][], raster_filter: string, values: number[]) => {
        // Dataset spatial_extent
        const bbox = [-81, -34, -80, -33];
        // Filtering rectangle: it overlaps a small portion of the test tile containing 3 values
        const filteringRectangle = {
          coordinates: filteringCoords,
          type: 'Polygon',
        };
        await addSyntheticData({
          ...syntheticDataOptions,
          depthLayers: 1,
          featureCoordinates: [
            // Array with one polygon
            filteringRectangle.coordinates,
          ],
          featureGeometryType: GISDataType.POLYGONAL,
          spatial_extent: bbox,
        });
        const sds = new SoilDataStorage();
        const entityManager = await getEntityManager();
        const geomId = await insertUserGeometry(entityManager, filteringRectangle as Polygon);
        const results = await sds.getRasterCoverage(entityManager, [geomId], {});
        expect((results[raster_filter] as number[])?.sort((a: number, b: number) => a - b)).toEqual(values);
      },
    );

    it('Filtering with big area should return all the raster values', async () => {
      // Dataset spatial_extent
      const bbox = [-81, -34, -80, -33];
      // Filtering rectangle (almost entire world)
      const filteringRectangle = {
        coordinates: [
          [
            [-162, 75],
            [-162, -51],
            [175, -51],
            [175, 75],
            [-162, 75],
          ],
        ],
        type: 'Polygon',
      };
      await addSyntheticData({
        ...syntheticDataOptions,
        depthLayers: 1,
        featureCoordinates: [
          // Array with one polygon
          filteringRectangle.coordinates,
        ],
        featureGeometryType: GISDataType.POLYGONAL,
        spatial_extent: bbox,
      });
      const sds = new SoilDataStorage();
      const entityManager = await getEntityManager();
      const geomId = await insertUserGeometry(entityManager, filteringRectangle as Polygon);
      const results = await sds.getRasterCoverage(entityManager, [geomId], {});
      expect(Object.keys(results).length).toBe(2);
      expect((results['land_cover'] as number[])?.sort((a: number, b: number) => a - b)).toEqual([
        0, 20, 30, 40, 50, 60, 70, 80, 90, 100, 111, 112, 113, 114, 115, 116, 121, 122, 123, 124, 125, 126, 200,
      ]);
      expect((results['soil_groups'] as number[])?.sort((a: number, b: number) => a - b)).toEqual([
        6567, 6576, 6578, 6582, 6584, 6772, 6776, 6777, 6782, 7076, 7082, 7171, 7176, 7189, 7283, 7583, 7680, 7686, 7688, 7884, 8072, 8076,
        8084, 8090, 8271, 8284, 8367, 8378, 8384, 8467, 8577, 8682,
      ]);
    });

    it.each([
      [{}, filteringMaskCoordinates], // No parameters, mask is filling all the rectangle
      [
        { raster_filters: { land_cover: [30] } },
        [
          [-80.719246032, -33.785714286],
          [-80.719246032, -33.786706349],
          [-80.720238095, -33.786706349],
          [-80.720238095, -33.785714286],
          [-80.719246032, -33.785714286],
        ],
      ],
      [
        { raster_filters: { land_cover: [60] } },
        [
          [-80.721933926, -33.783977188],
          [-80.718253968, -33.783977188],
          [-80.718253968, -33.785714286],
          [-80.720238095, -33.785714286],
          [-80.720238095, -33.787698413],
          [-80.721933926, -33.787698413],
          [-80.721933926, -33.783977188],
        ],
      ],
      [
        { raster_filters: { land_cover: [200] } },
        [
          [-80.721933926, -33.787698413],
          [-80.720238095, -33.787698413],
          [-80.720238095, -33.786706349],
          [-80.719246032, -33.786706349],
          [-80.719246032, -33.785714286],
          [-80.718253968, -33.785714286],
          [-80.718253968, -33.783977188],
          [-80.717474913, -33.783977188],
          [-80.717474913, -33.788328755],
          [-80.721933926, -33.788328755],
          [-80.721933926, -33.787698413],
        ],
      ],
      [{ raster_filters: { land_cover: [30, 60, 200] } }, filteringMaskCoordinates], // All values, mask is filling all the rectangle
    ])('Expected vector mask should be returned from a rectangle covering three raster values', async (parameters, expectedPolygon) => {
      // Filtering rectangle
      const filteringRectangle = {
        coordinates: [filteringMaskCoordinates],
        type: 'Polygon',
      };
      const entityManager = await getEntityManager();
      const results = await getVectorMask(entityManager, { geometries: [filteringRectangle as Polygon], parameters });
      expect(turf.area(results)).toEqual(turf.area({ type: 'Polygon', coordinates: [expectedPolygon] }));
    });

    it.each<[FilterCriteria, number, boolean]>(
      [false, true].flatMap(rasterize => [
        [{}, 25, rasterize], // No parameters, mask is filling all the rectangle
        [{ raster_filters: { land_cover: [30] } }, 1, rasterize],
        [{ raster_filters: { land_cover: [60] } }, 12, rasterize],
        [{ raster_filters: { land_cover: [200] } }, 12, rasterize],
        [{ raster_filters: { land_cover: [30, 60, 200] } }, 25, rasterize], // All values, mask is filling all the rectangle
      ]),
    )(
      'Expected raster mask should be returned from a rectangle covering three raster values',
      async (parameters, expectedPixels, rasterize) => {
        // Filtering rectangle
        const filteringRectangle = {
          coordinates: [filteringMaskCoordinates],
          type: 'Polygon',
        };
        const entityManager = await getEntityManager();
        const table = await getRasterMask(entityManager, { geometries: [filteringRectangle as Polygon], parameters }, 'table', rasterize);
        expect(table).toBeDefined();

        const [row] = await entityManager.query(`
        SELECT
          (SELECT COALESCE(SUM(count), 0) FROM ST_ValueCount(t.rast, 1) WHERE value = 1) AS true_count,
          t.width,
          t.height
        FROM "${table}" t
      `);

        const trueCount = Number(row.true_count);
        expect(trueCount).toBe(expectedPixels);

        const w = Number(row.width);
        const h = Number(row.height);
        expect(w).toBe(5);
        expect(h).toBe(5);
      },
    );

    it.each([[[0, 0, 100, 10]], [[0, 0, 10, 80]]])('Raster mask should have a maximum size of 1024 pixels', async bbox => {
      // Filtering rectangle
      const filteringRectangle = getPolygonFromBbox(bbox);
      const entityManager = await getEntityManager();
      const table = await getRasterMask(entityManager, { geometries: [filteringRectangle as Polygon], parameters: {} }, 'table');
      expect(table).toBeDefined();

      const [row] = await entityManager.query(`
        SELECT
          (SELECT COALESCE(SUM(count), 0) FROM ST_ValueCount(t.rast, 1) WHERE value = 1) AS true_count,
          t.width,
          t.height
        FROM "${table}" t
      `);

      const w = Number(row.width);
      const h = Number(row.height);
      const maxSize = Math.max(w, h);
      expect(maxSize).toEqual(1024);
    });
  });

  describe('Raster data filtering', () => {
    let mockSelectOverview: any;
    beforeEach(() => {
      // Do not reference any overview (they don't exist in test dump)
      mockSelectOverview = jest.spyOn(RasterUtilsModule, 'selectOverviewTable').mockImplementation((table: string) => {
        return table;
      });
    });

    afterAll(() => {
      mockSelectOverview.mockRestore();
    });

    afterAll(() => {
      const dir = process.env.LOCAL_STORAGE_ROOT_FOLDER!;
      for (const file of fs.readdirSync(dir)) {
        if (file.endsWith('_cog.tif')) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    });

    const rasterCoordinates = [
      [-82, -35],
      [-82, -33],
      [-80, -33],
      [-80, -35],
      [-82, -35],
    ];

    it('Filtering raster data should return a dataset when geometry intersects with its footprint', async () => {
      await addRasterData();
      const sds = new SoilDataStorage();
      const entityManager = await getEntityManager();
      // Filtering rectangle
      const filteringRectangle: Polygon = {
        coordinates: [rasterCoordinates],
        type: 'Polygon',
      };
      const geomId = await insertUserGeometry(entityManager, filteringRectangle);
      const results = await sds.filterRaster(entityManager, geomId, {});
      expect(results).toHaveLength(1);
      expect(results[0].raster_layer_count).toBe(1);
      // ingestRaster upserts without setting visibility so the DB default ('private') applies
      expect(results[0].visibility).toBe('private');
    });

    it('Filtering raster data should return empty array when geometry does not intersect any raster layer', async () => {
      await addRasterData();
      const sds = new SoilDataStorage();
      const entityManager = await getEntityManager();
      const geomId = await insertUserGeometry(entityManager, getPolygonFromBbox([170, 80, 171, 81]));
      const results = await sds.filterRaster(entityManager, geomId, {});
      expect(results).toHaveLength(0);
    });

    it.each([
      [{ min_depth: 0, max_depth: 30 }, { min_depth: 100 }, 0],
      [{ min_depth: 5, max_depth: 15 }, { min_depth: 5, max_depth: 15 }, 1],
      [{ reference_period_start: '2010-01-01', reference_period_stop: '2015-12-31' }, { min_sampling_date: '2020-01-01' }, 0],
      [
        { reference_period_start: '2010-01-01', reference_period_stop: '2020-12-31' },
        { min_sampling_date: '2015-01-01', max_sampling_date: '2018-01-01' },
        1,
      ],
    ])('Filtering with criteria: layer=%j filter=%j should return %i result(s)', async (layerFields, filter, expectedCount) => {
      await addRasterData(undefined, { layerFields });
      const sds = new SoilDataStorage();
      const entityManager = await getEntityManager();
      const geomId = await insertUserGeometry(entityManager, getPolygonFromBbox([-179.9, -89.9, 179.9, 89.9]));
      const results = await sds.filterRaster(entityManager, geomId, filter);
      expect(results).toHaveLength(expectedCount);
    });

    it('Filtering raster data should aggregate multiple layers from the same dataset into one summary', async () => {
      await addRasterData();
      await addRasterData(undefined, { layerFields: { reference_period_start: '2010-01-01', reference_period_stop: '2020-12-31' } });
      const sds = new SoilDataStorage();
      const entityManager = await getEntityManager();
      const filteringRectangle: Polygon = {
        coordinates: [rasterCoordinates],
        type: 'Polygon',
      };
      const geomId = await insertUserGeometry(entityManager, filteringRectangle);
      const results = await sds.filterRaster(entityManager, geomId, {});
      expect(results).toHaveLength(1);
      expect(results[0].raster_layer_count).toBe(2);
    }, 10000);

    describe('Filtering raster data with raster_filters', () => {
      beforeEach(async () => {
        await addRasterData();
        await addRasterFilterData();
        await addRasterFilterMappings();
      }, 10000);

      it('Should call getVectorMask when raster_filters are present', async () => {
        const spy = jest.spyOn(FilteringMasksModule, 'getVectorMask');
        const sds = new SoilDataStorage();
        const entityManager = await getEntityManager();
        const geomId = await insertUserGeometry(entityManager, getPolygonFromBbox([-82, -35, -80, -33]));
        await sds.filterRaster(entityManager, geomId, { raster_filters: { land_cover: [30] } });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
      }, 12000);

      it.each([
        [[30], 1],
        [[40], 0],
      ])(
        'For raster_filter.land_cover value %j → %i raster dataset(s) should be returned',
        async (landCoverValues, expectedCount) => {
          const sds = new SoilDataStorage();
          const entityManager = await getEntityManager();
          const geomId = await insertUserGeometry(entityManager, getPolygonFromBbox([-82, -35, -80, -33]));
          const results = await sds.filterRaster(entityManager, geomId, {
            raster_filters: { land_cover: landCoverValues },
          });
          expect(results).toHaveLength(expectedCount);
        },
        10000,
      );
    });
  });
});

describe('Local testing', () => {
  it.skip(
    'Local DB loading',
    async () => {
      const dir = process.env.LOCAL_STORAGE_ROOT_FOLDER!;
      for (const file of fs.readdirSync(dir)) {
        if (file.startsWith('test_raster')) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
      for (const input of [
        `${dir}/clsoilmaps_ksat_100-200cm.tif`,
        `${dir}/cog_isda_sol_db_od_m_30m_0__20cm_2001__2017_v0_13_wgs84.tif`,
        `${dir}/holisoils_nitrogen_topsoil_0-30cm_mean_forest.tif`,
        `${dir}/olm_sol_coarsefrag.vfraction_usda.3b1_m_250m_b0..0cm_1950..2017_v0.2.tif`,
        `${dir}/olm_sol_texture_class_usda_tt_m_250m_b0_0cm_1950_2017_v0_2.tif`,
        `${dir}/soilgrids250_bdod_5-15cm_mean.tif`,
        `${dir}/gSSURGO_AK_rootznemc.tiff`,
      ]) {
        const id = input.split('/').pop()!.split('.')[0];
        await addRasterDataset(id, input);
      }
    },
    2000 * 60 * 60,
  );
});
