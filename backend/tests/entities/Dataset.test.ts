import DatasetEntity from '../../src/entities/Dataset';
import { getEntityManager } from '../../src/utils/data-source';
import { Polygon } from 'typeorm';
import { addDataset } from '../../src/utils/mock';

const polygon: Polygon = {
  coordinates: [
    [
      [11.322484394, 44.503691914],
      [11.364550612, 44.503691914],
      [11.364550612, 44.481483367],
      [11.322484394, 44.481483367],
      [11.322484394, 44.503691914],
    ],
  ],
  type: 'Polygon',
};

describe('Dataset entity', () => {
  it('Creates and saves a new dataset', async () => {
    const dataset = await addDataset('slug', [11.322484394, 44.503691914, 11.364550612, 44.481483367]);
    const entityManager = await getEntityManager();
    const repo = await entityManager.getRepository(DatasetEntity);
    const savedLocation = await repo.findOneBy({ id: dataset.id });
    expect(savedLocation).toBeDefined();
    expect(savedLocation?.spatial_extent).toEqual(polygon);
  });
});
