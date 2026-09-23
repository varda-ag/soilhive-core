import { describe, it, expect } from '@jest/globals';
import { Polygon } from 'geojson';
import { getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import {
  addCategory,
  addDataset,
  addDatasetLayer,
  addFeatures,
  addLayer,
  addObservations,
  addProcedure,
  addSoilProperty,
} from '../../src/utils/mock';
import { computeClassDistribution, ClassDistributionOptions } from '../../src/data-layer/ClassDistribution';
import FilterService from '../../src/services/FilterService';
import { GISDataType } from '../../src/types/data';
import { FilterCriteria } from '../../src/interfaces/DatasetFilter';
import { ClassDefinition } from '../../src/interfaces/Job';
import { RequestData } from '../../src/interfaces/RequestData';
import { DepthRanges } from '../../src/types/enums';

const DATASET_BBOX = [-1, -1, 5, 5];

/** Units go in through the real insertUserGeometry, exactly as in the job. */
const addUnit = async (geometry: Polygon): Promise<string> => {
  const entityManager = await getEntityManager();
  const { id } = await new FilterService().insertUserGeometry({ entityManager, entitlements: {} } as RequestData, geometry);
  return id;
};

const bboxUnit = (bbox: number[]) => addUnit(getPolygonFromBbox(bbox));

const PH_CLASSES: ClassDefinition[] = [
  { name: 'Acid', max: 6.5 },
  { name: 'Neutral', min: 6.5, max: 7.5 },
  { name: 'Alkaline', min: 7.5 },
];

const run = async (
  options: Pick<ClassDistributionOptions, 'unitIds' | 'datasetSlugs' | 'soilPropertySlug'> &
    Partial<Omit<ClassDistributionOptions, 'filter'>> & { parameters?: FilterCriteria },
) => {
  const entityManager = await getEntityManager();
  return computeClassDistribution(entityManager, {
    filter: { geometryIds: options.unitIds, parameters: options.parameters ?? {}, area: 0 },
    classes: PH_CLASSES,
    timeAggregation: 1,
    depthRanges: DepthRanges.NONE,
    maxClassEntries: 1_000_000,
    workMem: '64MB',
    statementTimeoutMs: 120_000,
    ...options,
  });
};

let fixtureCounter = 0;
const unique = (prefix: string) => `${prefix}-${fixtureCounter++}`;

/**
 * One Dataset and Soil Property, with one Feature per call to `sample`. `layers` is UNIQUE NULLS
 * NOT DISTINCT on (license, sampling_date, min_depth, max_depth, horizon), so each sample's layer
 * carries a unique horizon unless the test is about what the layer holds.
 */
const seed = async () => {
  const dataset = await addDataset(unique('cd-ds'), DATASET_BBOX, GISDataType.POINT);
  const category = await addCategory(unique('cd-cat'));
  const soilProperty = await addSoilProperty(unique('cd-ph'), category.id, 'pH');
  const procedure = await addProcedure(unique('cd-proc'));
  let pointCounter = 0;

  const sample = async (
    values: number[],
    layer: { samplingDate?: string; minDepth?: number; maxDepth?: number } = {},
    options: { coordinates?: [number, number]; propertyId?: string } = {},
  ) => {
    const n = pointCounter++;
    const [feature] = await addFeatures(GISDataType.POINT, [options.coordinates ?? [0.5 + (n % 10) * 0.1, 0.5 + Math.floor(n / 10) * 0.1]]);
    const created = await addLayer(undefined, layer.samplingDate, layer.minDepth, layer.maxDepth, unique('h'));
    const datasetLayer = await addDatasetLayer(dataset.id, created.id, feature!.id, options.propertyId ?? soilProperty.id);
    await addObservations(values, procedure.id, datasetLayer.id);
  };

  return { dataset, soilProperty, category, sample };
};

describe('computeClassDistribution — classes', () => {
  it('reports each Class as a share of the Observations, in request order, with unclassified last', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const rows = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      soilPropertySlug: soilProperty.slug,
      classes: [
        { name: 'Low', max: 4 },
        { name: 'Mid', min: 4, max: 8 },
        { name: 'High', min: 8, max: 9 },
        { name: 'Top', min: 100 },
      ],
    });

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.dataset_id).toBe(dataset.slug);
    expect(row.unit_id).toBe(unitId);
    expect(row.count).toBe(10);
    expect(row.n_features).toBe(1);
    // An empty Class is still there at 0, so legends stay stable; 9 and 10 fall in no Class.
    expect(row.classes).toEqual([
      { name: 'Low', value: 30 },
      { name: 'Mid', value: 40 },
      { name: 'High', value: 10 },
      { name: 'Top', value: 0 },
      { name: 'unclassified', value: 20 },
    ]);
  });

  it('includes the lower bound, excludes the upper one, and leaves an absent bound open', async () => {
    const { dataset, soilProperty, sample } = await seed();
    // 6.5 and 7.5 sit exactly on a boundary; 3 and 12 are only reachable through the open ends.
    await sample([3, 6.5, 7.5, 12]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const [row] = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    // Nothing is unclassified, so no unclassified entry at all rather than one at 0.
    expect(row!.classes).toEqual([
      { name: 'Acid', value: 25 },
      { name: 'Neutral', value: 25 },
      { name: 'Alkaline', value: 50 },
    ]);
  });

  it('rounds shares to 3 decimals', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5, 7, 8]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const [row] = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    expect(row!.classes.map(share => share.value)).toEqual([33.333, 33.333, 33.333]);
  });
});

describe('computeClassDistribution — Year Windows', () => {
  it('aligns windows to multiples of time_aggregation, not to the data, and keeps undated Observations apart', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5], { samplingDate: '2016-04-01' });
    await sample([7], { samplingDate: '2018-09-01' });
    await sample([8], { samplingDate: '2019-05-01' });
    await sample([6]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const rows = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug, timeAggregation: 3 });

    // 2016 and 2018 share 2016–2018; 2019 opens the next window even though it is the latest year.
    expect(rows.map(row => [row.year_start, row.year_end, row.count])).toEqual([
      [2016, 2018, 2],
      [2019, 2021, 1],
      [null, null, 1],
    ]);
  });

  it('defaults to one calendar year per window', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5], { samplingDate: '2016-04-01' });
    await sample([7], { samplingDate: '2018-09-01' });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const rows = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    expect(rows.map(row => [row.year_start, row.year_end])).toEqual([
      [2016, 2016],
      [2018, 2018],
    ]);
  });
});

describe('computeClassDistribution — depth', () => {
  const seedDepths = async () => {
    const seeded = await seed();
    await seeded.sample([5], { minDepth: 0, maxDepth: 30 }); // midpoint 15 → 15–30
    await seeded.sample([6], { minDepth: 0, maxDepth: 10 }); // midpoint 5 → 5–15
    await seeded.sample([7], { minDepth: 30, maxDepth: 60 }); // midpoint 45 → 30–60
    await seeded.sample([8], { minDepth: 150, maxDepth: 300 }); // midpoint 225 → deeper than 200
    await seeded.sample([9]); // no recorded depth
    return seeded;
  };

  it('sorts each Observation into the one Standard Depth Range holding its midpoint', async () => {
    const { dataset, soilProperty } = await seedDepths();
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const rows = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      soilPropertySlug: soilProperty.slug,
      depthRanges: DepthRanges.STANDARD,
    });

    expect(rows.map(row => [row.depth_start, row.depth_end, row.count])).toEqual([
      [5, 15, 1],
      [15, 30, 1],
      [30, 60, 1],
      [200, null, 1],
      [null, null, 1],
    ]);
    // A 0–30 composite lands whole in 15–30, and says so through the span it actually covers.
    const composite = rows.find(row => row.depth_start === 15)!;
    expect(composite.depth_min).toBe(0);
    expect(composite.depth_max).toBe(30);
    // The no-depth bucket has no span to report, and says so by absence.
    const undepthed = rows.find(row => row.depth_start === null)!;
    expect(undepthed).not.toHaveProperty('depth_min');
    expect(undepthed).not.toHaveProperty('depth_max');
  });

  it('pools every depth into one bucket by default, with no range keys', async () => {
    const { dataset, soilProperty } = await seedDepths();
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const rows = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(5);
    expect(rows[0]).not.toHaveProperty('depth_start');
    expect(rows[0]).not.toHaveProperty('depth_end');
    expect(rows[0]!.depth_min).toBe(0);
    expect(rows[0]!.depth_max).toBe(300);
  });
});

describe('computeClassDistribution — scope', () => {
  it('reports one row per Dataset, never pooled across them', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5, 6]);
    // A second Dataset measuring the same Soil Property inside the same unit.
    const second = await addDataset(unique('cd-ds'), DATASET_BBOX, GISDataType.POINT);
    await addDatasetLayerFor(second.id, soilProperty.id, [1.8, 1.8], [7]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const rows = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug, second.slug], soilPropertySlug: soilProperty.slug });

    const byDataset = new Map(rows.map(row => [row.dataset_id, row]));
    expect(rows).toHaveLength(2);
    expect(byDataset.get(dataset.slug)!.count).toBe(2);
    expect(byDataset.get(dataset.slug)!.classes.find(share => share.name === 'Acid')!.value).toBe(100);
    expect(byDataset.get(second.slug)!.count).toBe(1);
    expect(byDataset.get(second.slug)!.classes.find(share => share.name === 'Neutral')!.value).toBe(100);
  });

  it('counts only the variable, and still honours the Filter soil property criterion', async () => {
    const { dataset, soilProperty, category, sample } = await seed();
    const other = await addSoilProperty(unique('cd-other'), category.id, 'pH');
    await sample([5]);
    await sample([8, 9], {}, { propertyId: other.id });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const rows = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(1);

    // The variable narrows within the Filter; it never overrides a Filter that excludes it.
    const excluded = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      soilPropertySlug: soilProperty.slug,
      parameters: { soil_properties: [other.slug] },
    });
    expect(excluded).toEqual([]);
  });

  it('counts an Observation in every overlapping unit, and emits no row for a unit without any', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5], {}, { coordinates: [1.5, 1.5] });
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);
    const empty = await bboxUnit([40, 40, 41, 41]);

    const rows = await run({ unitIds: [unitA, unitB, empty], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    expect(rows.map(row => row.unit_id).sort()).toEqual([unitA, unitB].sort());
    expect(rows.every(row => row.count === 1)).toBe(true);
  });
});

describe('computeClassDistribution — budget', () => {
  it('fails before aggregating when rows × (classes + 1) exceeds the budget, and never truncates', async () => {
    const { dataset, soilProperty, sample } = await seed();
    await sample([5], { samplingDate: '2016-01-01' });
    await sample([7], { samplingDate: '2017-01-01' });
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const base = {
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      soilPropertySlug: soilProperty.slug,
      classes: [{ name: 'All', min: 0 }],
    };

    // Two rows × (1 class + 1) = 4 entries.
    await expect(run({ ...base, maxClassEntries: 3 })).rejects.toMatchObject({
      code: 'DR_CLASS_DISTRIBUTION_TOO_LARGE',
      params: { rows: 2, entries: 4, max_entries: 3 },
    });
    expect(await run({ ...base, maxClassEntries: 4 })).toHaveLength(2);
    // The lever the error names works: one wider window is one row.
    expect(await run({ ...base, maxClassEntries: 3, timeAggregation: 2 })).toHaveLength(1);
  });
});

/** A second Soil Property sample in an existing Dataset, at its own location. */
const addDatasetLayerFor = async (datasetId: string, soilPropertyId: string, coordinates: [number, number], values: number[]) => {
  const [feature] = await addFeatures(GISDataType.POINT, [coordinates]);
  const layer = await addLayer(undefined, undefined, undefined, undefined, unique('h'));
  const datasetLayer = await addDatasetLayer(datasetId, layer.id, feature!.id, soilPropertyId);
  await addObservations(values, (await addProcedure(unique('cd-proc'))).id, datasetLayer.id);
  return datasetLayer;
};
