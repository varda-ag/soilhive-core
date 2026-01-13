import { Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { addDataset, addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import SoilDataStorage from '../../src/data-layer/SoilDataStorage';
import DatasetEntity from '../../src/entities/Dataset';

const bbox = [0, 0, 1, 1];
const bboxPolygon: Polygon = getPolygonFromBbox(bbox);

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

  it('Filtering should return some results', async () => {
    const layers = 5;
    const { dataset } = await addSyntheticData({ ...syntheticDataOptions, depthLayers: layers });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const results = await sds.filter(entityManager, getPolygonFromBbox([0, 0, 10, 10]), {});
    expect(results.length).toBe(1);
    expect(results[0].dataset_layer_count).toBe(layers);
    const resultDatasetIds = results.map(r => r.id);
    expect(resultDatasetIds).toContain(dataset.id);
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
    const results = await sds.filter(entityManager, bboxPolygon, { data_types: [filterType] });
    expect(results.length).toBe(expectedDatasetCount);
    for (let i = 0; i < expectedDatasetCount; i++) {
      expect(datasets.map(d => d.id)).toContain(results[i].id);
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
    const results = await sds.filter(entityManager, bboxPolygon, { min_depth, max_depth });
    expect(results.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      expect(results[0].dataset_layer_count).toBe(expectedCount);
    }
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
    const results = await sds.filter(entityManager, bboxPolygon, { min_sampling_date, max_sampling_date });
    expect(results.length).toBe(expectedResultCount);
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
    const results = await sds.filter(entityManager, bboxPolygon, { horizons });
    expect(results.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      const total: number = results.reduce((acc, curr) => acc + curr.dataset_layer_count, 0);
      expect(total).toBe(expectedCount);
    }
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
    const data1 = await addSyntheticData({ ...syntheticDataOptions, id: 1, soilPropertyNames: ['a', 'b'], depthLayers: 10 });
    const data2 = await addSyntheticData({ ...syntheticDataOptions, id: 2, soilPropertyNames: ['c', 'd'], depthLayers: 10 });
    const allSoilProperties = [...data1.soilProperties, ...data2.soilProperties];
    const soilPropertyMap = new Map<string, string>();
    allSoilProperties.forEach(sp => {
      soilPropertyMap.set(sp.slug, sp.id);
    });
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const results = await sds.filter(entityManager, bboxPolygon, {
      soil_properties: filter?.map(f => soilPropertyMap.get(f)),
    });
    expect(results.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      const total: number = results.reduce((acc, curr) => acc + curr.dataset_layer_count, 0);
      expect(total).toBe(expectedCount);
    }
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
    const results = await sds.filter(entityManager, bboxPolygon, { ...filter });
    expect(results.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      expect(results[0].dataset_layer_count).toBe(expectedCount);
    }
  });

  it.skip.each([[[[-80.7811, -33.7413]], [30], 1, 1]])(
    'Filtering using land cover should return expected data points',
    async (featureCoordinates, values, expectedResultCount, expectedCount) => {
      const bbox = [-81, -34, -80, -33];
      const tableName = 'land_cover'; //await addLandCover();
      await addSyntheticData({ ...syntheticDataOptions, depthLayers: 1, featureCoordinates, spatial_extent: bbox });
      const sds = new SoilDataStorage();
      const entityManager = await getEntityManager();
      const raster_filters = new Map<string, number[]>();
      raster_filters.set(tableName, values);
      const results = await sds.filter(entityManager, getPolygonFromBbox(bbox), { raster_filters });
      expect(results.length).toBe(expectedResultCount);
      if (expectedResultCount > 0) {
        expect(results[0].dataset_layer_count).toBe(expectedCount);
      }
    },
  );
});
