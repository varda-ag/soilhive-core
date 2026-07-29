import { describe, it, expect } from '@jest/globals';
import DataMappingService from '../../src/services/DataMappingService';
import { getEntityManager } from '../../src/utils/data-source';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import DataMappingEntity from '../../src/entities/DataMapping';
import { addCategory, addSoilProperty } from '../../src/utils/mock';

const mockToken: Token = {
  sub: 'test-user-id',
  email: 'test@example.com',
  scope: 'user',
  raw: 'mock-token',
  isSuperAdmin: false,
  isDataAdmin: false,
  isInternalRequest: false,
};

describe('DataMappingService', () => {
  describe('postDataMapping', () => {
    it('should create a new data mapping record when the hash is unique', async () => {
      const service = new DataMappingService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };

      const dataMapping = {
        magnesium: {
          property_id: 'magnesium',
        },
      };

      const result = await service.postDataMapping(requestData, dataMapping);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.data_mapping).toEqual(dataMapping);
    });

    it('should return the existing record (idempotency) when the same data mapping is posted', async () => {
      const service = new DataMappingService();
      const entityManager = await getEntityManager();
      const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };

      const dataMapping = {
        calcium: {
          property_id: 'calcium',
        },
      };

      const firstResult = await service.postDataMapping(requestData, dataMapping);
      const originalId = firstResult.id;

      const secondResult = await service.postDataMapping(requestData, dataMapping);

      expect(secondResult.id).toBe(originalId);
      expect(secondResult.data_mapping).toEqual(firstResult.data_mapping);
    });
  });

  describe('parseRasterDataMapping', () => {
    /** A band mapping needs a real soil property: the parser resolves the slug to read its unit. */
    const setUpBandMapping = async (suffix: string, bandMapping: (propertySlug: string) => object) => {
      const entityManager = await getEntityManager();
      const requestData: RequestData = { entityManager, token: mockToken, entitlements: {} };
      const category = await addCategory(`category-parse-raster-${suffix}`);
      const property = await addSoilProperty(`property-parse-raster-${suffix}`, category.id);
      const created = await new DataMappingService().postDataMapping(requestData, bandMapping(property.slug) as never);
      return { requestData, created };
    };

    it("carries a band's layer_description and additional_resources through unchanged", async () => {
      // file_id is a File slug; the parser neither resolves nor checks it.
      const resources = [{ file_id: 'technical-manual-2024' }, { url: 'https://example.org/manual.pdf' }];
      const { requestData, created } = await setUpBandMapping('carried', slug => ({
        '1': {
          property_id: slug,
          conversion_id: null,
          min_depth: 0,
          max_depth: 5,
          layer_description: 'Topsoil prediction.',
          additional_resources: resources,
        },
      }));

      const [band] = await new DataMappingService().parseRasterDataMapping(requestData, created.id);

      expect(band!.layerDescription).toBe('Topsoil prediction.');
      // Passed through unvalidated, exactly like the band number: the loader is what checks these,
      // so an unresolvable url survives the parse.
      expect(band!.additionalResources).toEqual(resources);
    });

    it('defaults both to empty when a band declares neither', async () => {
      const { requestData, created } = await setUpBandMapping('absent', slug => ({
        '1': { property_id: slug, conversion_id: null, min_depth: 0, max_depth: 5 },
      }));

      const [band] = await new DataMappingService().parseRasterDataMapping(requestData, created.id);

      expect(band!.layerDescription).toBeNull();
      expect(band!.additionalResources).toEqual([]);
    });

    it('treats a non-array additional_resources as none rather than passing it on', async () => {
      const { requestData, created } = await setUpBandMapping('malformed', slug => ({
        '1': { property_id: slug, conversion_id: null, min_depth: 0, max_depth: 5, additional_resources: 'manual.pdf' },
      }));

      const [band] = await new DataMappingService().parseRasterDataMapping(requestData, created.id);

      expect(band!.additionalResources).toEqual([]);
    });
  });

  it('should soft delete an existing mapping', async () => {
    const service = new DataMappingService();
    const entityManager = await getEntityManager();
    const requestData = { entityManager, token: mockToken, entitlements: {} };

    const created = await service.postDataMapping(requestData, { col1: { property_id: 'ph' } });

    await service.deleteDataMapping(requestData, created.id);

    // findOneBy ignores soft-deleted rows by default in TypeORM
    const found = await entityManager.getRepository(DataMappingEntity).findOneBy({ id: created.id });
    expect(found).toBeNull();
  });
});
