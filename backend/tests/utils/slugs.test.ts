import { describe, it, expect, beforeAll } from '@jest/globals';
import { v7 as uuidv7 } from 'uuid';
import DatasetEntity from '../../src/entities/Dataset';
import { getEntityManager } from '../../src/utils/data-source';
import { addCategory, addDataset, addFile } from '../../src/utils/mock';
import { getEntity, getEntities, idToSlug } from '../../src/utils/slugs';
import { RequestData } from '../../src/interfaces/RequestData';
import { EntityType } from '../../src/types/data';
import { EntityManager } from 'typeorm';
import SoilPropertyCategoryEntity from '../../src/entities/SoilPropertyCategory';
import SlugHistoryEntity from '../../src/entities/SlugHistory';
import FileEntity from '../../src/entities/File';
import { getNewPath } from '../../src/utils/slugs';

let requestData: RequestData;
let entityManager: EntityManager;

beforeAll(async () => {
  entityManager = await getEntityManager();
  const mockToken = {
    scope: 'mock-scope',
    raw: 'raw-auth-token',
    email: 'mock-email',
    isDataAdmin: () => true,
    isSuperAdmin: () => false,
  };
  requestData = {
    entityManager,
    token: mockToken,
  };
});

describe('getEntity', () => {
  it('should find entity by current slug', async () => {
    const dataset = await addDataset('slug-dataset', [11.322484394, 44.503691914, 11.364550612, 44.481483367]);
    const repo = await entityManager.getRepository(DatasetEntity);
    const expected = await repo.findOneBy({ id: dataset.id });
    const result = await getEntity(requestData, DatasetEntity, EntityType.DATASET, 'slug-dataset');
    expect(result).toEqual(expected);
  });

  it('should return entity via slug history if current slug not found', async () => {
    const category = await addCategory('slug-soil-prop-category-old');
    await entityManager
      .createQueryBuilder()
      .update(SoilPropertyCategoryEntity)
      .set({ category_name: 'slug-soil-prop-category-new' })
      .where('id = :id', { id: category.id })
      .execute();
    const repo = await entityManager.getRepository(SoilPropertyCategoryEntity);
    const expected = await repo.findOneBy({ category_name: 'slug-soil-prop-category-new' } as any);
    const result = await getEntity(
      requestData,
      SoilPropertyCategoryEntity,
      EntityType.SOIL_PROPERTY_CATEGORY,
      'slug-soil-prop-category-old',
    );
    expect(result).toEqual(expected);
  });

  it('should throw NOT_FOUND when slug and slug history do not exist', async () => {
    await expect(getEntity(requestData, SoilPropertyCategoryEntity, EntityType.SOIL_PROPERTY_CATEGORY, 'missing-slug')).rejects.toThrow(
      "Entity with slug 'missing-slug' not found",
    );
  });

  it('should throw NOT_FOUND when slug history exists but entity does not', async () => {
    await entityManager.getRepository(SlugHistoryEntity).save({
      slug: 'old-slug',
      entity_type: EntityType.FILE,
      entity_id: uuidv7(),
    });
    await expect(getEntity(requestData, FileEntity, EntityType.FILE, 'old-slug')).rejects.toThrow("Entity with slug 'old-slug' not found");
  });
});

describe('getEntities', () => {
  it('should return all entities when all slugs exist', async () => {
    const dataset_slugs: string[] = [];
    for (let i = 0; i < 2; i++) {
      // Always a point dataset
      dataset_slugs.push((await addDataset(`slug-dataset-${i}`, [11.322484394, 44.503691914, 11.364550612, 44.481483367])).slug);
    }
    const result = await getEntities(requestData, DatasetEntity, EntityType.DATASET, dataset_slugs);
    expect(result.map(e => e.slug)).toEqual(['slug-dataset-0', 'slug-dataset-1']);
  });

  it('should resolve missing slugs via slug history', async () => {
    const category = await addCategory('slug-soil-prop-category-old');
    await entityManager
      .createQueryBuilder()
      .update(SoilPropertyCategoryEntity)
      .set({ category_name: 'slug-soil-prop-category-new' })
      .where('id = :id', { id: category.id })
      .execute();
    const repo = await entityManager.getRepository(SoilPropertyCategoryEntity);
    const expected = await repo.findOneBy({ category_name: 'slug-soil-prop-category-new' } as any);
    const result = await getEntities(requestData, SoilPropertyCategoryEntity, EntityType.SOIL_PROPERTY_CATEGORY, [
      'slug-soil-prop-category-old',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(expected!.id);
  });

  it('should throw NOT_FOUND when missing slugs have no slug history', async () => {
    await expect(getEntities(requestData, SoilPropertyCategoryEntity, EntityType.SOIL_PROPERTY_CATEGORY, ['missing-slug'])).rejects.toThrow(
      'Slugs missing-slug not found',
    );
  });

  it('should preserve input slug order regardless of DB return order', async () => {
    const file1 = await addFile(`slug-file-1`);
    const file2 = await addFile(`slug-file-2`);
    await entityManager
      .createQueryBuilder()
      .update(FileEntity)
      .set({ name: 'slug-file-2-new' })
      .where('id = :id', { id: file2.id })
      .execute();
    const result = await getEntities(requestData, FileEntity, EntityType.FILE, ['slug-file-2', 'slug-file-1']);
    expect(result.map(e => e.id)).toEqual([file2.id, file1.id]);
  });
});

describe('getNewPath', () => {
  it('should replace the old slug with the new slug in a simple path', () => {
    const originalUrl = '/api/datasets/old-dataset-name';
    const oldSlug = 'old-dataset-name';
    const newSlug = 'new-shiny-dataset';
    const result = getNewPath(originalUrl, oldSlug, newSlug);
    expect(result).toBe('/api/datasets/new-shiny-dataset');
  });

  it('should preserve query parameters when replacing the slug', () => {
    const originalUrl = '/api/datasets/old-slug?version=1&sort=desc';
    const oldSlug = 'old-slug';
    const newSlug = 'new-slug';
    const result = getNewPath(originalUrl, oldSlug, newSlug);
    expect(result).toBe('/api/datasets/new-slug?version=1&sort=desc');
  });

  it.each([
    [{}, {}],
    [undefined, undefined],
    [1, 1],
    ['a', 'a'],
    [{ id: 1 }, { id: 1 }],
    [{ id: 'a' }, { id: 'a' }],
    [
      { id: 'a', slug: null },
      { id: 'a', slug: null },
    ],
    [{ id: 'a', slug: 'b' }, { id: 'b' }],
    [{ slug: 'b' }, { slug: 'b' }],
  ])('should replace IDs with slugs', (input, expected) => {
    // Testing single object
    expect(idToSlug(input)).toEqual(expected);
    // Testing arrays
    expect(idToSlug([])).toEqual([]);
    expect(idToSlug([input])).toEqual([expected]);
    expect(idToSlug([input, input])).toEqual([expected, expected]);
  });
});
