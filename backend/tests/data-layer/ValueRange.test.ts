import { describe, it, expect } from '@jest/globals';
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
import { computeValueRange, ValueRangeOptions } from '../../src/data-layer/ValueRange';
import FilterService from '../../src/services/FilterService';
import { GISDataType } from '../../src/types/data';
import { FilterCriteria } from '../../src/interfaces/DatasetFilter';
import { RequestData } from '../../src/interfaces/RequestData';

const DATASET_BBOX = [-1, -1, 5, 5];

const bboxUnit = async (bbox: number[]): Promise<string> => {
  const entityManager = await getEntityManager();
  const { id } = await new FilterService().insertUserGeometry({ entityManager, entitlements: {} } as RequestData, getPolygonFromBbox(bbox));
  return id;
};

const run = async ({
  parameters,
  soilPropertySlug,
  ...options
}: Pick<ValueRangeOptions, 'unitIds' | 'datasetSlugs'> &
  Partial<Pick<ValueRangeOptions, 'timeAggregation'>> & { soilPropertySlug: string; parameters?: FilterCriteria }) => {
  const entityManager = await getEntityManager();
  return computeValueRange(entityManager, {
    filter: { geometryIds: options.unitIds, parameters: parameters ?? {}, area: 0 },
    variable: { soilPropertySlug },
    timeAggregation: 'none',
    workMem: '64MB',
    statementTimeoutMs: 120_000,
    ...options,
  });
};

let fixtureCounter = 0;
const unique = (prefix: string) => `${prefix}-${fixtureCounter++}`;

/** Each sample gets its own layer (unique horizon), as `layers` is deduplicated by content. */
const sample = async (datasetId: string, soilPropertyId: string, coordinates: [number, number], values: number[]) => {
  const [feature] = await addFeatures(GISDataType.POINT, [coordinates]);
  const layer = await addLayer(undefined, undefined, undefined, undefined, unique('h'));
  const datasetLayer = await addDatasetLayer(datasetId, layer.id, feature!.id, soilPropertyId);
  await addObservations(values, (await addProcedure(unique('vr-proc'))).id, datasetLayer.id);
  return feature!;
};

const seedProperty = async () => {
  const category = await addCategory(unique('vr-cat'));
  return addSoilProperty(unique('vr-ph'), category.id, 'pH');
};

describe('computeValueRange', () => {
  it('reports the whole request and each Dataset, listing only Datasets with Observations', async () => {
    const soilProperty = await seedProperty();
    const lucas = await addDataset(unique('vr-lucas'), DATASET_BBOX, GISDataType.POINT);
    const farm = await addDataset(unique('vr-farm'), DATASET_BBOX, GISDataType.POINT);
    const empty = await addDataset(unique('vr-empty'), DATASET_BBOX, GISDataType.POINT);
    await sample(lucas.id, soilProperty.id, [0.5, 0.5], [3.9, 8.4]);
    await sample(farm.id, soilProperty.id, [0.6, 0.6], [5.1, 41]);
    await sample(farm.id, soilProperty.id, [0.7, 0.7], [6]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { overall, datasets } = await run({
      unitIds: [unitId],
      datasetSlugs: [lucas.slug, farm.slug, empty.slug],
      soilPropertySlug: soilProperty.slug,
    });

    expect(overall).toEqual({ count: 5, n_features: 3, min: 3.9, max: 41 });
    expect(datasets).toEqual(
      [
        { dataset_id: lucas.slug, count: 2, n_features: 1, min: 3.9, max: 8.4 },
        { dataset_id: farm.slug, count: 3, n_features: 2, min: 5.1, max: 41 },
      ].sort((a, b) => a.dataset_id.localeCompare(b.dataset_id)),
    );
  });

  it('adds request-wide and per-Dataset figures per Year Window, keeping the all-years total', async () => {
    const soilProperty = await seedProperty();
    const dataset = await addDataset(unique('vr-ds'), DATASET_BBOX, GISDataType.POINT);
    const [early, late] = await addFeatures(GISDataType.POINT, [
      [0.5, 0.5],
      [0.6, 0.6],
    ]);
    for (const [feature, date, value] of [
      [early!, '2018-05-01', 4],
      [late!, '2021-05-01', 9],
    ] as const) {
      const layer = await addLayer(undefined, date, undefined, undefined, unique('h'));
      const datasetLayer = await addDatasetLayer(dataset.id, layer.id, feature.id, soilProperty.id);
      await addObservations([value], (await addProcedure(unique('vr-proc'))).id, datasetLayer.id);
    }
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const result = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug, timeAggregation: 1 });

    expect(result.overall).toEqual({ count: 2, n_features: 2, min: 4, max: 9 });
    expect(result.windows).toEqual([
      { year_start: 2018, year_end: 2018, count: 1, n_features: 1, min: 4, max: 4 },
      { year_start: 2021, year_end: 2021, count: 1, n_features: 1, min: 9, max: 9 },
    ]);
    expect(result.datasets.map(entry => [entry.dataset_id, entry.year_start])).toEqual([
      [dataset.slug, 2018],
      [dataset.slug, 2021],
    ]);
  });

  it('counts an Observation once however many overlapping units it falls in', async () => {
    const soilProperty = await seedProperty();
    const dataset = await addDataset(unique('vr-ds'), DATASET_BBOX, GISDataType.POINT);
    await sample(dataset.id, soilProperty.id, [1.5, 1.5], [7]);
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);

    const { overall } = await run({ unitIds: [unitA, unitB], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    expect(overall).toEqual({ count: 1, n_features: 1, min: 7, max: 7 });
  });

  it('counts a location sampled by two Datasets once in the total', async () => {
    const soilProperty = await seedProperty();
    const first = await addDataset(unique('vr-first'), DATASET_BBOX, GISDataType.POINT);
    const second = await addDataset(unique('vr-second'), DATASET_BBOX, GISDataType.POINT);
    const shared = await sample(first.id, soilProperty.id, [0.5, 0.5], [5]);
    // Same Feature, second Dataset.
    const layer = await addLayer(undefined, undefined, undefined, undefined, unique('h'));
    const datasetLayer = await addDatasetLayer(second.id, layer.id, shared.id, soilProperty.id);
    await addObservations([6], (await addProcedure(unique('vr-proc'))).id, datasetLayer.id);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { overall, datasets } = await run({
      unitIds: [unitId],
      datasetSlugs: [first.slug, second.slug],
      soilPropertySlug: soilProperty.slug,
    });

    expect(overall.count).toBe(2);
    expect(overall.n_features).toBe(1);
    expect(datasets.every(entry => entry.n_features === 1)).toBe(true);
  });

  it('counts only the variable, and honours the Filter soil property criterion', async () => {
    const soilProperty = await seedProperty();
    const other = await seedProperty();
    const dataset = await addDataset(unique('vr-ds'), DATASET_BBOX, GISDataType.POINT);
    await sample(dataset.id, soilProperty.id, [0.5, 0.5], [5]);
    await sample(dataset.id, other.id, [0.6, 0.6], [99]);
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const measured = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });
    expect(measured.overall).toEqual({ count: 1, n_features: 1, min: 5, max: 5 });

    const excluded = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      soilPropertySlug: soilProperty.slug,
      parameters: { soil_properties: [other.slug] },
    });
    expect(excluded).toEqual({ overall: { count: 0, n_features: 0 }, windows: [], datasets: [] });
  });

  it('answers zero, with no extremes, when nothing matches', async () => {
    const soilProperty = await seedProperty();
    const dataset = await addDataset(unique('vr-ds'), DATASET_BBOX, GISDataType.POINT);
    await sample(dataset.id, soilProperty.id, [0.5, 0.5], [5]);
    const farAway = await bboxUnit([40, 40, 41, 41]);

    const result = await run({ unitIds: [farAway], datasetSlugs: [dataset.slug], soilPropertySlug: soilProperty.slug });

    expect(result).toEqual({ overall: { count: 0, n_features: 0 }, windows: [], datasets: [] });
    expect(result.overall).not.toHaveProperty('min');
    expect(result.overall).not.toHaveProperty('max');
  });
});
