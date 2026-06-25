import { describe, it, expect } from '@jest/globals';
import { addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import SoilDataStorage from '../../src/data-layer/SoilDataStorage';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { makeFilter } from './SoilDataStorage.test';

const entitlements = {};

describe('SoilDataStorage count', () => {
  it('getSoilDataCount should return the total number of observations in a dataset', async () => {
    // 1. Setup: Create a dataset with specific dimensions
    // 2 layers * 2 features * 2 observations per layer = 8 total observations
    const layers = 2;
    const features = 2;
    const obsPerLayer = 2;
    const totalExpected = layers * features * obsPerLayer;

    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      depthLayers: layers,
      featureCount: features,
      observationsPerLayer: obsPerLayer,
    });

    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const filter = { geometryIds: [], area: 0, parameters: {} };

    // 2. Execute: Get the count
    const count = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [dataset.slug]);

    // 3. Verify: The count should match the total observations created
    expect(count).toBe(totalExpected);
  });

  it('getSoilDataCount should return 0 when no records match the criteria', async () => {
    // 1. Setup: Create a dataset but use a different slug for the query
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 999,
      depthLayers: 1,
    });

    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const filter = { geometryIds: [], area: 0, parameters: {} };

    // 2. Execute: Search for a slug that doesn't exist
    const count = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [dataset.id]);

    // 3. Verify
    expect(count).toBe(0);
  });

  it('getSoilDataCount should filter by soil properties', async () => {
    // 1. Setup: 1 layer * 1 feature * 2 properties = 2 observations total
    const layers = 1;
    const features = 1;
    const propertyNames = ['clay', 'sand'];

    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      depthLayers: layers,
      featureCount: features,
      soilPropertyNames: propertyNames,
    });

    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();

    // 2. Execute: Filter only for 'clay'
    const filter = {
      geometryIds: [],
      area: 0,
      parameters: { soil_properties: ['clay'] },
    };

    const count = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [dataset.slug]);

    // 3. Verify: Should only count the 'clay' observation, not the 'sand' one
    // (1 layer * 1 feature * 1 filtered property = 1)
    expect(count).toBe(1);
  });

  it('getSoilDataCount should filter by depth range', async () => {
    const layers = 10;
    // 10 layers: 0-10, 10-20, ..., 90-100
    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 4, // Unique ID for this test case
      depthLayers: layers,
      featureCount: 1,
      observationsPerLayer: 1,
    });

    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();

    // We want to capture 0-10, 10-20, and 20-30
    const filter = {
      geometryIds: [],
      area: 0,
      parameters: { min_depth: 0, max_depth: 25 },
    };

    const count = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [dataset.slug]);

    // Intersection logic:
    // 0-10 ( [0..10] [0..25] ) -> intersect
    // 10-20 ( [10..20] [0..25] ) -> intersect
    // 20-30 ( [20..30] [0..25] ) -> intersect
    // 30-40 ( [0..25] [30..40] ) -> no intersect
    expect(count).toBe(3);
  });

  it('getSoilDataCount should filter by spatial geometry', async () => {
    // 1. Setup: Create 5 features at specific known coordinates
    // We'll place them in a line: (0.1, 0.1), (0.2, 0.2) ... (0.5, 0.5)
    const coordinates: [number, number][] = [
      [0.1, 0.1],
      [0.2, 0.2],
      [0.3, 0.3],
      [0.4, 0.4],
      [0.5, 0.5],
    ];

    const { dataset } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 5,
      featureCount: 5,
      featureCoordinates: coordinates,
      depthLayers: 1,
      observationsPerLayer: 1,
    });

    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();

    // 2. Execute: Define a search box that only covers the first two points
    // Bounding box from (0, 0) to (0.25, 0.25)
    const queryPolygon = getPolygonFromBbox([0, 0, 0.25, 0.25]);
    const filter = await makeFilter(entityManager, queryPolygon, {});

    const count = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [dataset.slug]);

    // 3. Verify: Only (0.1, 0.1) and (0.2, 0.2) should be inside the box
    // 2 features * 1 layer * 1 observation = 2
    expect(count).toBe(2);
  });

  it('getSoilDataCount should correctly isolate counts between multiple datasets', async () => {
    const sds = new SoilDataStorage();
    const entityManager = await getEntityManager();
    const filter = { geometryIds: [], area: 0, parameters: {} };

    // 1. Setup Dataset A: 1 layer * 1 feature * 2 obs = 2 total
    const { dataset: datasetA } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 10,
      depthLayers: 1,
      featureCount: 1,
      observationsPerLayer: 2,
      soilPropertyNames: ['ph'],
    });

    // 2. Setup Dataset B: 1 layer * 1 feature * 5 obs = 5 total
    const { dataset: datasetB } = await addSyntheticData({
      ...syntheticDataOptions,
      id: 11,
      depthLayers: 1,
      featureCount: 1,
      observationsPerLayer: 5,
      soilPropertyNames: ['ca'],
    });

    // 3. Execute & Verify Dataset A
    const countA = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [datasetA.slug]);
    expect(countA).toBe(2);

    // 4. Execute & Verify Dataset B
    const countB = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [datasetB.slug]);
    expect(countB).toBe(5);

    // 5. Execute & Verify Combined (A + B)
    const combinedCount = await sds.getSoilDataCount({ entityManager, entitlements }, filter, [datasetA.slug, datasetB.slug]);
    expect(combinedCount).toBe(7);
  });
});
