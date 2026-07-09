import { describe, it, expect } from '@jest/globals';
import { Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import { addDatasetLayer, addLayer, addSyntheticData, syntheticDataOptions } from '../../src/utils/mock';
import SoilDataStorage from '../../src/data-layer/SoilDataStorage';
import { getDaiPointDataPrecomputed, isUnfilteredDaiParameters, refreshDaiStats } from '../../src/data-layer/DaiStats';
import DatasetService from '../../src/services/DatasetService';
import FilterService from '../../src/services/FilterService';
import { RequestData } from '../../src/interfaces/RequestData';
import { Token } from '../../src/interfaces/Token';
import { makeFilter } from './SoilDataStorage.test';

const worldBbox: [number, number, number, number] = [0, 0, 1, 1];
const worldPolygon: Polygon = getPolygonFromBbox(worldBbox);

const getRequestData = async (): Promise<RequestData> => ({
  entityManager: await getEntityManager(),
  token: { sub: 'tests' } as Token,
  entitlements: {},
});

const statsCount = async (): Promise<number> => {
  const entityManager = await getEntityManager();
  const [{ count }] = await entityManager.query('SELECT COUNT(*)::int AS count FROM feature_dai_stats');
  return count;
};

const statsRowFor = async (featureId: string) => {
  const entityManager = await getEntityManager();
  const rows = await entityManager.query(
    `SELECT num_soil_properties, num_props_below_30, num_dated_layers, num_distinct_years
     FROM feature_dai_stats WHERE feature_id = $1`,
    [featureId],
  );
  return rows[0];
};

describe('isUnfilteredDaiParameters', () => {
  it('treats empty parameters as unfiltered', () => {
    expect(isUnfilteredDaiParameters({})).toBe(true);
  });

  it('treats raster_filters with only empty value arrays as unfiltered (matching buildRasterSql)', () => {
    expect(isUnfilteredDaiParameters({ raster_filters: {} })).toBe(true);
    expect(isUnfilteredDaiParameters({ raster_filters: { land_cover: [] } })).toBe(true);
    expect(isUnfilteredDaiParameters({ raster_filters: { land_cover: [1, 2] } })).toBe(false);
  });

  it('treats any present criterion as filtered, including explicit nulls', () => {
    expect(isUnfilteredDaiParameters({ soil_properties: ['ph'] })).toBe(false);
    expect(isUnfilteredDaiParameters({ data_types: [] })).toBe(false);
    expect(isUnfilteredDaiParameters({ min_sampling_date: null })).toBe(false);
    expect(isUnfilteredDaiParameters({ max_depth: 30 })).toBe(false);
    expect(isUnfilteredDaiParameters({ horizons: [null] })).toBe(false);
    expect(isUnfilteredDaiParameters({ licenses: ['cc-by'] })).toBe(false);
  });
});

describe('refreshDaiStats + getDaiPointDataPrecomputed', () => {
  it('full refresh reproduces the live getDaiPointData results', async () => {
    await addSyntheticData({
      ...syntheticDataOptions,
      id: 1,
      featureCount: 2,
      featureCoordinates: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
      depthLayers: 5,
      soilPropertyNames: ['prop_a', 'prop_b'],
    });
    await addSyntheticData({
      ...syntheticDataOptions,
      id: 2,
      featureCount: 1,
      featureCoordinates: [[0.3, 0.35]],
      depthLayers: 2,
      soilPropertyNames: ['prop_c'],
    });

    const entityManager = await getEntityManager();
    const sds = new SoilDataStorage();
    const filter = await makeFilter(entityManager, worldPolygon, {});
    const legacy = await sds.getDaiPointData(entityManager, filter);

    await refreshDaiStats(entityManager);
    const precomputed = await getDaiPointDataPrecomputed(entityManager, worldPolygon);

    const byLon = (a: { lon: number }, b: { lon: number }) => a.lon - b.lon;
    expect(precomputed).toHaveLength(3);
    expect([...precomputed].sort(byLon)).toEqual([...legacy].sort(byLon));
  });

  it('returns only features whose centroid falls inside the AOI', async () => {
    await addSyntheticData({
      ...syntheticDataOptions,
      id: 3,
      featureCount: 2,
      featureCoordinates: [
        [0.1, 0.1],
        [0.8, 0.8],
      ],
    });
    const entityManager = await getEntityManager();
    await refreshDaiStats(entityManager);

    const rows = await getDaiPointDataPrecomputed(entityManager, getPolygonFromBbox([0, 0, 0.5, 0.5]));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lon).toBeCloseTo(0.1);
    expect(rows[0]!.lat).toBeCloseTo(0.1);
  });

  it('scoped refresh only recomputes features of the given datasets', async () => {
    const entityManager = await getEntityManager();
    const a = await addSyntheticData({ ...syntheticDataOptions, id: 1, featureCount: 1, featureCoordinates: [[0.1, 0.1]] });
    await refreshDaiStats(entityManager, [a.dataset.id]);
    expect(await statsCount()).toBe(1);

    const b = await addSyntheticData({
      ...syntheticDataOptions,
      id: 2,
      featureCount: 1,
      featureCoordinates: [[0.2, 0.2]],
      soilPropertyNames: ['prop_b'],
    });
    // b is not refreshed yet, so its feature must not appear
    expect(await statsCount()).toBe(1);

    await refreshDaiStats(entityManager, [b.dataset.id]);
    expect(await statsCount()).toBe(2);
  });

  it('excludes raster datasets like getDaiPointData does', async () => {
    const entityManager = await getEntityManager();
    const a = await addSyntheticData({ ...syntheticDataOptions, id: 4, featureCount: 1, featureCoordinates: [[0.4, 0.4]] });
    await entityManager.query(`UPDATE datasets SET gis_datatype = 'raster' WHERE id = $1`, [a.dataset.id]);

    await refreshDaiStats(entityManager);
    expect(await statsCount()).toBe(0);
  });

  it('dataset soft-delete recomputes shared features and drops exclusive ones', async () => {
    // Feature (0.5, 0.5) belongs to dataset A (one undeep 2021 layer) and, via an
    // extra dataset_layer, to dataset B (a 0-50cm 2023 layer) — B also has its own
    // feature at (0.6, 0.6).
    const a = await addSyntheticData({
      ...syntheticDataOptions,
      id: 1,
      featureCount: 1,
      featureCoordinates: [[0.5, 0.5]],
      soilPropertyNames: ['prop_a'],
    });
    const b = await addSyntheticData({
      ...syntheticDataOptions,
      id: 2,
      featureCount: 1,
      featureCoordinates: [[0.6, 0.6]],
      soilPropertyNames: ['prop_b'],
    });
    const sharedFeature = a.features![0]!;
    const extraLayer = await addLayer(undefined, '2023-06-01', 0, 50, 'X');
    await addDatasetLayer(b.dataset.id, extraLayer.id, sharedFeature.id, b.soilProperties[0]!.id);

    const entityManager = await getEntityManager();
    await refreshDaiStats(entityManager);
    expect(await statsCount()).toBe(2);
    expect(await statsRowFor(sharedFeature.id)).toEqual({
      num_soil_properties: 2, // prop_a (A) + prop_b (B)
      num_props_below_30: 1, // only the 0-50cm layer goes below 30
      num_dated_layers: 2,
      num_distinct_years: 2, // 2021 (A) + 2023 (extra layer)
    });

    // deleteDataset soft-deletes and refreshes the rollup for A's features
    await new DatasetService().deleteDataset(await getRequestData(), a.dataset.slug);

    expect(await statsCount()).toBe(2); // shared feature survives with B-only counts
    expect(await statsRowFor(sharedFeature.id)).toEqual({
      num_soil_properties: 1,
      num_props_below_30: 1,
      num_dated_layers: 1,
      num_distinct_years: 1,
    });
  });

  it('drops features left with no qualifying data after a soft-delete', async () => {
    const a = await addSyntheticData({ ...syntheticDataOptions, id: 5, featureCount: 1, featureCoordinates: [[0.7, 0.7]] });
    const entityManager = await getEntityManager();
    await refreshDaiStats(entityManager);
    expect(await statsCount()).toBe(1);

    await new DatasetService().deleteDataset(await getRequestData(), a.dataset.slug);
    expect(await statsCount()).toBe(0);
  });
});

describe('FilterService.getDai routing', () => {
  const filterService = new FilterService();
  const resolution = 5;

  it('serves unfiltered requests from the precomputed stats', async () => {
    await addSyntheticData({ ...syntheticDataOptions, id: 6, featureCount: 1, featureCoordinates: [[0.25, 0.25]] });
    const requestData = await getRequestData();
    const filter = await filterService.createFilter(requestData, { geometries: [worldPolygon], parameters: {} });

    // The rollup has not been refreshed: an empty result proves the request was
    // answered from feature_dai_stats and not by the live aggregation.
    const beforeRefresh = await filterService.getDai(requestData, worldBbox, resolution, filter.id);
    expect(beforeRefresh.cells).toEqual({});

    await refreshDaiStats(requestData.entityManager);
    const dai = await filterService.getDai(requestData, worldBbox, resolution, filter.id);
    // score = 1 soil property + 0 below-30cm + 1 dated layer + 1 distinct year
    expect(Object.values(dai.cells)).toEqual([3]);
    expect(dai.min).toBe(3);
    expect(dai.max).toBe(3);
  });

  it('serves filtered requests from the live query path', async () => {
    await addSyntheticData({ ...syntheticDataOptions, id: 7, featureCount: 1, featureCoordinates: [[0.3, 0.3]] });
    const requestData = await getRequestData();
    const filter = await filterService.createFilter(requestData, {
      geometries: [worldPolygon],
      parameters: { soil_properties: ['ph'] },
    });

    // feature_dai_stats is empty; a non-empty result proves the live path ran
    const dai = await filterService.getDai(requestData, worldBbox, resolution, filter.id);
    expect(Object.values(dai.cells)).toEqual([3]);
  });
});
