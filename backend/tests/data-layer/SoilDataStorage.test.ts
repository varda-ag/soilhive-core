import { Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import DatasetEntity from '../../src/entities/Dataset';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { newDataset } from '../mock';
import SoilDataStorage from '../../src/data-layer/SoilDataStorage';

describe('SoilDataStorage class', () => {
  it.each([
    [[0, 0, 10, 10], [0, 0, 11, 11], 'full'],
    [[0, 0, 10, 10], [5, 5, 15, 15], 'partial'],
    [[0, 0, 10, 10], [20, 20, 30, 30], 'none'],
  ])('Dataset overlap type', async (datasetBbox, queryBbox, expectedType) => {
    const entityManager = await getEntityManager();
    const repo = await entityManager.getRepository(DatasetEntity);

    const dataset = newDataset(`dataset_overlap_test_${expectedType}`, datasetBbox);
    const saved = await repo.save(dataset);

    const query: Polygon = getPolygonFromBbox(queryBbox);

    const sds = new SoilDataStorage();
    sds.getOverlapType(entityManager, query).then(overlapMap => {
      expect(overlapMap.size).toBe(1);
      const overlapType = overlapMap.get(saved.id);
      expect(overlapType).toBeDefined();
      expect(overlapType).toEqual(expectedType);
    });
  });
});
