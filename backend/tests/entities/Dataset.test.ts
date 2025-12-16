import DatasetEntity from '../../src/entities/Dataset';
import SlugHistoryEntity from '../../src/entities/SlugHistory';
import { EntityType } from '../../src/types/data';
import { getEntityManager } from '../../src/utils/data-source';
import { Polygon } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { newDataset } from '../mock';

describe('Dataset entity', () => {
  it('Creates and saves a new dataset', async () => {
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
    const datasetId = uuidv7();

    const entityManager = await getEntityManager();

    const slugHistory = new SlugHistoryEntity();
    slugHistory.entity_id = datasetId;
    slugHistory.entity_type = EntityType.DATASET;
    slugHistory.slug = 'slug';

    const slugHistoryRepo = await entityManager.getRepository(SlugHistoryEntity);
    await slugHistoryRepo.save(slugHistory);

    const dataset = newDataset('slug', [11.322484394, 44.503691914, 11.364550612, 44.481483367]);
    dataset.id = datasetId;
    dataset.created_by = 'tests';

    const repo = await entityManager.getRepository(DatasetEntity);
    const saved = await repo.save(dataset);

    const savedLocation = await repo.findOneBy({ id: saved.id });
    expect(savedLocation).toBeDefined();
    expect(savedLocation?.spatial_extent).toEqual(polygon);
  });
});
