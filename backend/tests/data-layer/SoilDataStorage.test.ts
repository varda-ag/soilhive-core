import { Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { addDataset, addSyntheticData } from '../mock';
import SoilDataStorage from '../../src/data-layer/SoilDataStorage';
import DatasetEntity from '../../src/entities/Dataset';

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
    const dataset = await addSyntheticData(1, [1, 1, 9, 9], 1, 1, layers);
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
  ])('Filtering by GIS data type should return expected datasets', async (filterType, expectedDatasetCount) => {
    const bbox = [0, 0, 1, 1];
    const datasets: DatasetEntity[] = [];
    for (let i = 0; i < expectedDatasetCount; i++) {
      // Always a point dataset
      datasets.push(await addSyntheticData(i, bbox, 1, 1, 1));
    }
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const results = await sds.filter(entityManager, getPolygonFromBbox(bbox), { data_types: [filterType] });
    expect(results.length).toBe(expectedDatasetCount);
    for (let i = 0; i < expectedDatasetCount; i++) {
      expect(datasets.map(d => d.id)).toContain(results[i].id);
    }
  });

  it.each([
    [undefined, undefined, 1, 10],
    [-100, undefined, 1, 10],
    [undefined, 100, 1, 10],
    [100, undefined, 1, 10], // 100 touches max depth
    [undefined, 0, 1, 10], // 00 touches min depth
    [200, undefined, 0, 0],
    [undefined, -200, 0, 0],
    [0, 100, 1, 10],
    [0, 10, 1, 10],
  ])('Filtering by depth should return expected layers', async (min_depth, max_depth, expectedResultCount, expectedLayerCount) => {
    const bbox = [0, 0, 1, 1];
    await addSyntheticData(1, bbox, 1, 1, 10); // 10 layers with depths 0-100
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const results = await sds.filter(entityManager, getPolygonFromBbox(bbox), { min_depth, max_depth });
    expect(results.length).toBe(expectedResultCount);
    if (expectedResultCount > 0) {
      expect(results[0].dataset_layer_count).toBe(expectedLayerCount);
    }
  });
});
