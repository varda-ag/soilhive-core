import { Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { addDataset, addSyntheticData } from '../mock';
import SoilDataStorage from '../../src/data-layer/SoilDataStorage';

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
    sds.getOverlapType(entityManager, query).then(overlapMap => {
      expect(overlapMap.size).toBe(1);
      const overlapType = overlapMap.get(dataset.id);
      expect(overlapType).toBeDefined();
      expect(overlapType).toEqual(expectedType);
    });
  });

  it('Filtering should return some results', async () => {
    const layers = 5;
    const dataset = await addSyntheticData(1, [1, 1, 9, 9], 1, 1, layers);
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    await sds.filter(entityManager, getPolygonFromBbox([0, 0, 10, 10]), {}).then(results => {
      expect(results.length).toBe(1);
      expect(results[0].dataset_layer_count).toBe(layers);
      const resultDatasetIds = results.map(r => r.id);
      expect(resultDatasetIds).toContain(dataset.id);
    });
  });
});
