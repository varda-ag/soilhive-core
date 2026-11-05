import { describe, it, expect } from '@jest/globals';
import { getDataSource, getEntityManager } from '../../src/utils/data-source';
import { getPolygonFromBbox } from '../../src/utils/geometry';
import {
  addCategory,
  addDataset,
  addDatasetLayer,
  addDatasetLayers,
  addFeatures,
  addLayer,
  addObservations,
  addProcedure,
  addSoilProperty,
} from '../../src/utils/mock';
import { computeCorrelation, CorrelationOptions } from '../../src/data-layer/Correlation';
import FilterService from '../../src/services/FilterService';
import { GISDataType } from '../../src/types/data';
import { FilterCriteria } from '../../src/interfaces/DatasetFilter';
import { RequestData } from '../../src/interfaces/RequestData';
import { CorrelationMeasure } from '../../src/types/enums';

const DATASET_BBOX = [-1, -1, 5, 5];

const bboxUnit = async (bbox: number[]): Promise<string> => {
  const entityManager = await getEntityManager();
  const { id } = await new FilterService().insertUserGeometry({ entityManager, entitlements: {} } as RequestData, getPolygonFromBbox(bbox));
  return id;
};

let fixtureCounter = 0;
const unique = (prefix: string) => `${prefix}-${fixtureCounter++}`;

interface LayerSpec {
  samplingDate?: string;
  minDepth?: number | null;
  maxDepth?: number | null;
}

const DEFAULT_LAYER: LayerSpec = { minDepth: 0, maxDepth: 5 };

/** Two Soil Properties in one Dataset; each `location` is one Feature. */
const seed = async () => {
  const dataset = await addDataset(unique('cr-ds'), DATASET_BBOX, GISDataType.POINT);
  const category = await addCategory(unique('cr-cat'));
  const x = await addSoilProperty(unique('cr-clay'), category.id, '%');
  const y = await addSoilProperty(unique('cr-soc'), category.id, 'g/kg');
  const procedure = await addProcedure(unique('cr-proc'));
  let pointCounter = 0;

  const layerOf = async (spec: LayerSpec) =>
    addLayer(undefined, spec.samplingDate, spec.minDepth ?? undefined, spec.maxDepth ?? undefined, unique('h'));

  const location = async (
    values: { x?: number[]; y?: number[] },
    layers: { x?: LayerSpec; y?: LayerSpec } = {},
    options: { coordinates?: [number, number]; datasetId?: string; featureId?: string } = {},
  ): Promise<string> => {
    const n = pointCounter++;
    const featureId =
      options.featureId ??
      (await addFeatures(GISDataType.POINT, [options.coordinates ?? [0.5 + (n % 10) * 0.1, 0.5 + Math.floor(n / 10) * 0.1]]))[0]!.id;
    const shared = layers.x === undefined && layers.y === undefined ? await layerOf(DEFAULT_LAYER) : undefined;
    for (const [property, axis] of [
      [x, 'x'],
      [y, 'y'],
    ] as const) {
      const axisValues = values[axis];
      if (axisValues === undefined) {
        continue;
      }
      const layer = shared ?? (await layerOf(layers[axis] ?? DEFAULT_LAYER));
      const datasetLayer = await addDatasetLayer(options.datasetId ?? dataset.id, layer.id, featureId, property.id);
      await addObservations(axisValues, procedure.id, datasetLayer.id);
    }
    return featureId;
  };

  /** `count` Features in bulk, one shared Layer, x = i and y = 2i + 1. */
  const manyLocations = async (count: number) => {
    const coordinates = Array.from({ length: count }, (_, i) => [0.1 + (i % 100) * 0.015, 0.1 + Math.floor(i / 100) * 0.1]);
    const features: { id: string }[] = await addFeatures(GISDataType.POINT, coordinates);
    const layer = await layerOf(DEFAULT_LAYER);
    const featureIds = features.map(f => f.id);
    const xLayers: { id: string }[] = await addDatasetLayers(
      dataset.id,
      layer.id,
      featureIds,
      featureIds.map(() => x.id),
    );
    const yLayers: { id: string }[] = await addDatasetLayers(
      dataset.id,
      layer.id,
      featureIds,
      featureIds.map(() => y.id),
    );
    const schema = process.env.POSTGRES_SCHEMA;
    const dataSource = await getDataSource();
    await dataSource.query(
      `INSERT INTO ${schema}.observations (value, procedure_id, dataset_layer_id)
       SELECT v.value, $1::uuid, v.id FROM unnest($2::uuid[], $3::float8[]) AS v(id, value)`,
      [
        procedure.id,
        [...xLayers.map(l => l.id), ...yLayers.map(l => l.id)],
        [...featureIds.map((_, i) => i), ...featureIds.map((_, i) => 2 * i + 1)],
      ],
    );
  };

  return { dataset, x, y, location, manyLocations };
};

type RunOptions = Pick<CorrelationOptions, 'unitIds' | 'datasetSlugs' | 'x' | 'y'> &
  Partial<Omit<CorrelationOptions, 'filter'>> & { parameters?: FilterCriteria };

const run = async ({ parameters, ...options }: RunOptions) =>
  computeCorrelation(await getEntityManager(), {
    filter: { geometryIds: options.unitIds, parameters: parameters ?? {}, area: 0 },
    measure: CorrelationMeasure.MEAN,
    timeAggregation: 'none',
    maxRows: 200_000,
    maxTotalPoints: 500_000,
    workMem: '64MB',
    statementTimeoutMs: 120_000,
    ...options,
  });

/** Pearson r, for checking the database against a plain definition. */
const pearson = (xs: number[], ys: number[]): number => {
  const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  xs.forEach((xv, i) => {
    sxy += (xv - mx) * (ys[i]! - my);
    sxx += (xv - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  });
  return sxy / Math.sqrt(sxx * syy);
};

/** Average ranks, so ties share one rank. */
const ranks = (values: number[]): number[] =>
  values.map(value => {
    const below = values.filter(other => other < value).length;
    const equal = values.filter(other => other === value).length;
    return below + (equal + 1) / 2;
  });

const round3 = (value: number) => Number(value.toFixed(3));

describe('computeCorrelation — statistics', () => {
  it('gives a perfect fit for y = 2x + 1', async () => {
    const { dataset, x, y, location } = await seed();
    for (let i = 1; i <= 12; i += 1) {
      await location({ x: [i], y: [2 * i + 1] });
    }
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { overall, results } = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug });

    const figures = { n_points: 12, pearson_r: 1, spearman_rho: 1, r_squared: 1, slope: 2, intercept: 1 };
    expect(overall).toEqual([{ dataset_id: dataset.slug, depth_start: 0, depth_end: 5, ...figures }]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ dataset_id: dataset.slug, unit_id: unitId, depth_start: 0, depth_end: 5, ...figures });
    expect(results[0]!.points_truncated).toBe(false);
    expect(results[0]).not.toHaveProperty('year_start');
    // x[i] and y[i] stay one location.
    expect(results[0]!.x.map((xv, i) => [xv, results[0]!.y[i]]).sort((a, b) => a[0]! - b[0]!)).toEqual(
      Array.from({ length: 12 }, (_, i) => [i + 1, 2 * (i + 1) + 1]),
    );
  });

  it('matches the plain definitions on noisy data with ties', async () => {
    const { dataset, x, y, location } = await seed();
    const xs = [1, 2, 2, 3, 5, 8, 8, 8, 10, 11, 13, 20];
    const ys = [3.1, 1.2, 4.4, 4.4, 2.5, 9.9, 7.3, 8.1, 6.6, 12.5, 10.2, 15.7];
    for (let i = 0; i < xs.length; i += 1) {
      await location({ x: [xs[i]!], y: [ys[i]!] });
    }
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const [row] = (await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug })).results;

    const r = pearson(xs, ys);
    const mx = xs.reduce((t, v) => t + v, 0) / xs.length;
    const my = ys.reduce((t, v) => t + v, 0) / ys.length;
    const slope = xs.reduce((t, v, i) => t + (v - mx) * (ys[i]! - my), 0) / xs.reduce((t, v) => t + (v - mx) ** 2, 0);
    expect(row).toMatchObject({
      n_points: 12,
      pearson_r: round3(r),
      spearman_rho: round3(pearson(ranks(xs), ranks(ys))),
      r_squared: round3(r * r),
      slope: round3(slope),
      intercept: round3(my - slope * mx),
    });
  });

  it('reduces the values of one location with the measure', async () => {
    const { dataset, x, y, location } = await seed();
    await location({ x: [1, 2, 9], y: [5] });
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const base = { unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug };

    const mean = await run({ ...base, measure: CorrelationMeasure.MEAN });
    const median = await run({ ...base, measure: CorrelationMeasure.MEDIAN });

    expect(mean.results[0]).toMatchObject({ n_points: 1, x: [4], y: [5] });
    expect(median.results[0]).toMatchObject({ n_points: 1, x: [2], y: [5] });
  });

  it('sends only n_points below the minimum, and still sends the points', async () => {
    const { dataset, x, y, location } = await seed();
    for (let i = 1; i <= 9; i += 1) {
      await location({ x: [i], y: [i * 3] });
    }
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { overall, results } = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug });

    expect(overall).toEqual([{ dataset_id: dataset.slug, depth_start: 0, depth_end: 5, n_points: 9 }]);
    const { x: xs, y: ys, ...rest } = results[0]!;
    expect(rest).toEqual({ dataset_id: dataset.slug, unit_id: unitId, depth_start: 0, depth_end: 5, n_points: 9, points_truncated: false });
    expect(xs).toHaveLength(9);
    expect(ys).toHaveLength(9);
  });

  it('sends only n_points when x does not vary', async () => {
    const { dataset, x, y, location } = await seed();
    for (let i = 1; i <= 12; i += 1) {
      await location({ x: [4], y: [i] });
    }
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const [row] = (await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug })).overall;

    expect(row).toEqual({ dataset_id: dataset.slug, depth_start: 0, depth_end: 5, n_points: 12 });
  });

  it('samples a row over max_points with a fixed seed, and computes on every point', async () => {
    const { dataset, x, y, manyLocations } = await seed();
    await manyLocations(1200);
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const base = { unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug };

    const first = (await run(base)).results[0]!;
    const second = (await run(base)).results[0]!;

    expect(first).toMatchObject({ n_points: 1200, points_truncated: true, pearson_r: 1, slope: 2, intercept: 1 });
    expect(first.x).toHaveLength(1000);
    expect(first.y).toHaveLength(1000);
    expect(first.x.every((xv, i) => first.y[i] === 2 * xv + 1)).toBe(true);
    expect(second.x).toEqual(first.x);
    expect(second.y).toEqual(first.y);
  });
});

describe('computeCorrelation — pairing', () => {
  it('never pairs across Datasets, and a Dataset with only x has no rows', async () => {
    const { dataset, x, y, location } = await seed();
    const second = await addDataset(unique('cr-ds'), DATASET_BBOX, GISDataType.POINT);
    const onlyX = await addDataset(unique('cr-ds'), DATASET_BBOX, GISDataType.POINT);
    const featureId = await location({ x: [1], y: [2] }, {}, { coordinates: [1, 1] });
    await location({ x: [3], y: [4] }, {}, { featureId, datasetId: second.id });
    await location({ x: [5] }, {}, { featureId, datasetId: onlyX.id });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { overall, results } = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug, second.slug, onlyX.slug],
      x: x.slug,
      y: y.slug,
    });

    expect(results.map(row => [row.dataset_id, row.x, row.y]).sort()).toEqual(
      [
        [dataset.slug, [1], [2]],
        [second.slug, [3], [4]],
      ].sort(),
    );
    expect(overall).toHaveLength(2);
  });

  it('pairs layers whose midpoints share a Standard Depth Range, and leaves out layers without depth', async () => {
    const { dataset, x, y, location } = await seed();
    // Clay 0–30 (midpoint 15) pairs with soc 10–30 (midpoint 20), both in 15–30.
    await location({ x: [1], y: [2] }, { x: { minDepth: 0, maxDepth: 30 }, y: { minDepth: 10, maxDepth: 30 } });
    // Clay 0–30 does not pair with soc 0–10 (midpoint 5, in 5–15).
    await location({ x: [3], y: [4] }, { x: { minDepth: 0, maxDepth: 30 }, y: { minDepth: 0, maxDepth: 10 } });
    // No depth: left out.
    await location({ x: [5], y: [6] }, { x: { minDepth: null, maxDepth: null }, y: { minDepth: null, maxDepth: null } });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const { results } = await run({ unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug });

    expect(results.map(row => [row.depth_start, row.depth_end, row.x, row.y])).toEqual([[15, 30, [1], [2]]]);
  });

  it('puts a location in every overlapping unit, but once in overall', async () => {
    const { dataset, x, y, location } = await seed();
    await location({ x: [1], y: [2] }, {}, { coordinates: [0.5, 0.5] });
    await location({ x: [3], y: [4] }, {}, { coordinates: [1.5, 1.5] });
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);

    const { overall, results } = await run({ unitIds: [unitA, unitB], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug });

    const byUnit = new Map(results.map(row => [row.unit_id, row]));
    expect(byUnit.get(unitA)!.n_points).toBe(2);
    expect(byUnit.get(unitB)!.n_points).toBe(1);
    expect(overall).toHaveLength(1);
    expect(overall[0]!.n_points).toBe(2);
  });

  it('buckets by Year Window, with undated layers in the null year bucket', async () => {
    const { dataset, x, y, location } = await seed();
    await location(
      { x: [1], y: [2] },
      { x: { ...DEFAULT_LAYER, samplingDate: '2016-04-01' }, y: { ...DEFAULT_LAYER, samplingDate: '2016-04-01' } },
    );
    await location(
      { x: [3], y: [4] },
      { x: { ...DEFAULT_LAYER, samplingDate: '2018-09-01' }, y: { ...DEFAULT_LAYER, samplingDate: '2018-09-01' } },
    );
    await location(
      { x: [5], y: [6] },
      { x: { ...DEFAULT_LAYER, samplingDate: '2019-05-01' }, y: { ...DEFAULT_LAYER, samplingDate: '2019-05-01' } },
    );
    await location({ x: [7], y: [8] });
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const base = { unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug };

    const windowed = await run({ ...base, timeAggregation: 3 });
    expect(windowed.results.map(row => [row.year_start, row.year_end, row.n_points])).toEqual([
      [2016, 2018, 2],
      [2019, 2021, 1],
      [null, null, 1],
    ]);

    const pooled = await run(base);
    expect(pooled.results).toHaveLength(1);
    expect(pooled.results[0]!.n_points).toBe(4);
    expect(pooled.results[0]).not.toHaveProperty('year_start');
  });

  it('honours the Filter soil property criterion', async () => {
    const { dataset, x, y, location } = await seed();
    await location({ x: [1], y: [2] });
    const unitId = await bboxUnit([0, 0, 2, 2]);

    const excluded = await run({
      unitIds: [unitId],
      datasetSlugs: [dataset.slug],
      x: x.slug,
      y: y.slug,
      parameters: { soil_properties: [x.slug] },
    });

    expect(excluded).toEqual({ overall: [], results: [] });
  });
});

describe('computeCorrelation — budget', () => {
  it('fails when the points sent exceed the budget', async () => {
    const { dataset, x, y, location } = await seed();
    await location({ x: [1], y: [2] }, {}, { coordinates: [0.5, 0.5] });
    await location({ x: [3], y: [4] }, {}, { coordinates: [1.5, 1.5] });
    const unitA = await bboxUnit([0, 0, 2, 2]);
    const unitB = await bboxUnit([1, 1, 3, 3]);
    const base = { unitIds: [unitA, unitB], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug };

    // Two points in unit A, one in unit B.
    await expect(run({ ...base, maxTotalPoints: 2 })).rejects.toMatchObject({
      code: 'DR_CORRELATION_TOO_LARGE',
      params: { points: 3, max_points: 2 },
    });
    expect((await run({ ...base, maxTotalPoints: 3 })).results).toHaveLength(2);
  });

  it('fails when overall + results rows exceed the budget', async () => {
    const { dataset, x, y, location } = await seed();
    await location({ x: [1], y: [2] }, { x: { ...DEFAULT_LAYER, samplingDate: '2016' }, y: { ...DEFAULT_LAYER, samplingDate: '2016' } });
    await location({ x: [3], y: [4] }, { x: { ...DEFAULT_LAYER, samplingDate: '2017' }, y: { ...DEFAULT_LAYER, samplingDate: '2017' } });
    const unitId = await bboxUnit([0, 0, 2, 2]);
    const base = { unitIds: [unitId], datasetSlugs: [dataset.slug], x: x.slug, y: y.slug, timeAggregation: 1 };

    // Two results rows and two overall rows.
    await expect(run({ ...base, maxRows: 3 })).rejects.toMatchObject({
      code: 'DR_CORRELATION_TOO_LARGE',
      params: { rows: 4, max_rows: 3 },
    });
    expect((await run({ ...base, maxRows: 4 })).results).toHaveLength(2);
  });
});
